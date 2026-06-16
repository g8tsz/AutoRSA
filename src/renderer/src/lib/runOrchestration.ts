import type { ConfirmFn } from '../context/ConfirmContext'
import {
  buildCliArgs,
  formatCommandLine,
  isEffectiveDry,
  taskRunPreflight,
  type BuildCliOpts
} from './buildArgs'
import { missingEnvByBroker, parseBrokerList, taskUsesAllBrokers } from './brokers'
import { trimLogEnd } from './log'
import { parseHoldingsFromLog } from './parseHoldings'
import { snapshotFromRows } from './holdingsDiff'
import type { AppSettings, RsaRunResult, Store, TaskRow } from '../types'

export type RunProgress = {
  current: number
  total: number
  taskName: string
}

export type RunCallbacks = {
  confirm: ConfirmFn
  updateStore: (u: (p: Store) => Store) => void
  setLog: (s: string | ((p: string) => string)) => void
  setRunning: (v: boolean) => void
  onProgress?: (p: RunProgress | null) => void
  getLog?: () => string
}

function appendWithCap(
  setLog: (s: string | ((p: string) => string)) => void,
  max: number,
  add: string
): void {
  setLog((prev) => trimLogEnd(prev + add, max))
}

function uniqCsv(...vals: Array<string | undefined>): string {
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of vals) {
    for (const p of (v ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)) {
      if (seen.has(p)) continue
      seen.add(p)
      out.push(p)
    }
  }
  return out.join(',')
}

export function resolveRunOpts(task: TaskRow, settings: AppSettings): BuildCliOpts {
  if (!taskUsesAllBrokers(task) || !settings.brokerProfile.applyToAllKeyword) return {}
  return {
    brokerOverride: settings.brokerProfile.include.trim() || 'all',
    notBrokersOverride: uniqCsv(task.notBrokers, settings.brokerProfile.exclude)
  }
}

function resolveTimeoutMs(task: TaskRow, settings: AppSettings, runOpts?: BuildCliOpts): number | undefined {
  const brokers = parseBrokerList(runOpts?.brokerOverride ?? task.brokers)
  let sec = settings.commandTimeoutSec
  for (const b of brokers) {
    const override = settings.perBrokerTimeoutSec[b]
    if (override != null && override > sec) sec = override
  }
  return sec > 0 ? sec * 1000 : undefined
}

async function ensureLiveAck(settings: AppSettings, confirm: ConfirmFn): Promise<boolean> {
  if (settings.liveOrderAcknowledged) return true
  const ok = await confirm({
    title: 'Live order disclaimer',
    body:
      'Automated trading may violate your broker terms of service. You are solely responsible for all orders placed through this app. Only proceed if you understand and accept these risks.',
    confirmLabel: 'I understand',
    variant: 'danger'
  })
  return ok
}

export type RunResult = 'done' | 'aborted' | 'cancelled' | 'error_stop'

export async function runOne(
  t: TaskRow,
  settings: AppSettings,
  cb: RunCallbacks,
  opts?: {
    batch?: boolean
    cancelRef?: { current: boolean }
    runOpts?: BuildCliOpts
    batchLiveCount?: { current: number }
    batchTickerShares?: Map<string, number>
  }
): Promise<RunResult> {
  const { confirm, updateStore, setLog, setRunning } = cb
  const runOpts = opts?.runOpts
  const preflight = taskRunPreflight(t, runOpts)
  if (preflight) {
    appendWithCap(setLog, settings.maxLogChars, `\n--- ${t.name} ---\n${preflight}\n\n— Summary: ${t.name} · skipped —\n`)
    return 'aborted'
  }

  const argsPreview = buildCliArgs(t, settings, runOpts)
  const live = !isEffectiveDry(t, settings)

  if (settings.riskGuard.enabled && live && (t.mode === 'buy' || t.mode === 'sell')) {
    if (t.amount > settings.riskGuard.maxSharesPerOrder) {
      appendWithCap(
        setLog,
        settings.maxLogChars,
        `\n--- ${t.name} ---\nBlocked: amount ${t.amount} exceeds max live shares (${settings.riskGuard.maxSharesPerOrder}).\n`
      )
      return 'aborted'
    }
    if (opts?.batchLiveCount && opts.batchLiveCount.current >= settings.riskGuard.maxLiveOrdersPerBatch) {
      appendWithCap(setLog, settings.maxLogChars, `\n--- ${t.name} ---\nBlocked: batch live order limit reached.\n`)
      return 'aborted'
    }
    const tickers = t.tickers.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)
    for (const tk of tickers) {
      const prev = opts?.batchTickerShares?.get(tk) ?? 0
      if (prev + t.amount > settings.riskGuard.maxTotalSharesPerTicker) {
        appendWithCap(
          setLog,
          settings.maxLogChars,
          `\n--- ${t.name} ---\nBlocked: total live shares for ${tk} would exceed limit.\n`
        )
        return 'aborted'
      }
    }
  }

  const selectedBrokers = parseBrokerList(runOpts?.brokerOverride ?? t.brokers)
  const envSummary = await window.api.envSummary({ envDirectory: settings.envDirectory })
  const missingByBroker = missingEnvByBroker(selectedBrokers, envSummary.keys)
  const missingLines = Object.entries(missingByBroker)
    .map(([b, keys]) => `${b}: ${keys.join(', ')}`)
    .join('\n')
  const preflightLines = [
    `Task: ${t.name}`,
    `Mode: ${t.mode}`,
    `Command: ${formatCommandLine(settings.autoRsaExecutable, argsPreview)}`,
    `cwd: ${envSummary.cwd}`,
    `Brokers: ${selectedBrokers.join(', ') || '(none)'}`,
    `Run type: ${live ? 'LIVE' : 'DRY'}`,
    missingLines ? `Missing .env vars:\n${missingLines}` : 'Missing .env vars: none'
  ].join('\n')

  const needsConfirm = !opts?.batch || live || Object.keys(missingByBroker).length > 0
  if (needsConfirm) {
    if (live) {
      const ack = await ensureLiveAck(settings, confirm)
      if (!ack) return 'aborted'
      if (settings.riskGuard.requireTypedConfirmForLive) {
        const ok = await confirm({
          title: 'Confirm LIVE order',
          body: preflightLines,
          confirmLabel: 'Place live order',
          variant: 'danger',
          typeToConfirm: 'LIVE'
        })
        if (!ok) return 'aborted'
      } else {
        const ok = await confirm({
          title: 'Confirm LIVE run',
          body: preflightLines + '\n\nThis is a LIVE run. Real orders may be placed.',
          confirmLabel: 'Run live',
          variant: 'danger'
        })
        if (!ok) return 'aborted'
      }
    } else {
      const ok = await confirm({
        title: 'Confirm run',
        body: preflightLines,
        confirmLabel: 'Run'
      })
      if (!ok) return 'aborted'
    }
  }
  if (opts?.cancelRef?.current) return 'cancelled'

  const max = settings.maxLogChars
  const maxTries = settings.retryOnFailure.enabled
    ? Math.max(1, Math.min(20, settings.retryOnFailure.maxAttempts))
    : 1

  if (!opts?.batch) setRunning(true)
  try {
    updateStore((s) => ({
      ...s,
      tasks: s.tasks.map((x) => (x.id === t.id ? { ...x, status: 'running' as const } : x)),
      settings: live && !s.settings.liveOrderAcknowledged
        ? { ...s.settings, liveOrderAcknowledged: true }
        : s.settings
    }))

    const t0 = Date.now()
    let lastRes: RsaRunResult | null = null
    const logStartLen = cb.getLog?.()?.length ?? 0

    for (let attempt = 1; attempt <= maxTries; attempt++) {
      if (opts?.cancelRef?.current) return 'cancelled'
      const args = buildCliArgs(t, settings, runOpts)
      if (attempt === 1) {
        appendWithCap(setLog, max, `\n--- ${t.name} ---\n$ ${formatCommandLine(settings.autoRsaExecutable, args)}\n`)
      } else {
        appendWithCap(setLog, max, `\n— Retry ${attempt}/${maxTries} —\n`)
      }

      const res = await window.api.rsaRun({
        args,
        cwd: settings.envDirectory,
        autoRsaExecutable: settings.autoRsaExecutable,
        timeoutMs: resolveTimeoutMs(t, settings, runOpts)
      })
      lastRes = res
      if (res.error) appendWithCap(setLog, max, res.error + '\n')
      if (res.ok) break
      if (!settings.retryOnFailure.enabled) break
      if (attempt >= maxTries) break
      if (res.exitKind === 'user_stopped' || res.exitKind === 'timeout') break
    }

    const res = lastRes!
    const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1)
    appendWithCap(
      setLog,
      max,
      `\n— Summary: ${t.name} · ${res.ok ? 'ok' : 'error'} · exit ${res.code} · ${elapsedSec}s —\n`
    )

    if (live) {
      void window.api.auditAppendLive({
        taskName: t.name,
        mode: t.mode,
        commandLine: formatCommandLine(settings.autoRsaExecutable, argsPreview),
        cwd: envSummary.cwd,
        ok: res.ok,
        code: res.code
      })
      if (opts?.batchLiveCount) opts.batchLiveCount.current += 1
      if (opts?.batchTickerShares && (t.mode === 'buy' || t.mode === 'sell')) {
        for (const tk of t.tickers.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)) {
          opts.batchTickerShares.set(tk, (opts.batchTickerShares.get(tk) ?? 0) + t.amount)
        }
      }
    }

    const errLine =
      res.error ?? (!res.ok ? (res.exitKind === 'user_stopped' ? 'Stopped' : `exit ${res.code}`) : undefined)

    const runLogSlice = cb.getLog?.()?.slice(logStartLen) ?? ''
    const holdingsRows = t.mode === 'holdings' && res.ok ? parseHoldingsFromLog(runLogSlice) : []

    updateStore((s) => ({
      ...s,
      tasks: s.tasks.map((x) =>
        x.id === t.id
          ? {
              ...x,
              status: res.ok ? 'ok' : 'error',
              lastError: errLine,
              lastRun: new Date().toISOString()
            }
          : x
      ),
      runStats: s.settings.telemetryLocalEnabled
        ? { ok: s.runStats.ok + (res.ok ? 1 : 0), err: s.runStats.err + (res.ok ? 0 : 1) }
        : s.runStats,
      runHistory: [
        {
          id: crypto.randomUUID(),
          taskId: t.id,
          taskName: t.name,
          mode: t.mode,
          commandLine: formatCommandLine(settings.autoRsaExecutable, argsPreview),
          cwd: envSummary.cwd,
          ok: res.ok,
          code: res.code,
          exitKind: res.exitKind,
          elapsedSec: Number(elapsedSec),
          createdAt: new Date().toISOString()
        },
        ...(s.runHistory ?? [])
      ].slice(0, 50),
      holdingsSnapshots:
        holdingsRows.length > 0
          ? [snapshotFromRows(t.id, t.name, holdingsRows, runLogSlice), ...(s.holdingsSnapshots ?? [])].slice(
              0,
              20
            )
          : s.holdingsSnapshots
    }))

    if (!res.ok && !settings.batchContinueOnError && opts?.batch) {
      return 'error_stop'
    }
    return res.ok ? 'done' : 'done'
  } finally {
    if (!opts?.batch) setRunning(false)
  }
}

export async function runBatch(
  list: TaskRow[],
  settings: AppSettings,
  cb: RunCallbacks,
  cancelRef: { current: boolean },
  runOptsFactory: (t: TaskRow) => BuildCliOpts
): Promise<void> {
  if (list.length === 0) return
  const hasLive = list.some((t) => !isEffectiveDry(t, settings))
  if (hasLive) {
    const ok = await cb.confirm({
      title: 'Start batch',
      body: 'Some tasks are not dry runs. Continue for ALL selected tasks?',
      confirmLabel: 'Run all',
      variant: 'danger'
    })
    if (!ok) return
  }
  cancelRef.current = false
  cb.setRunning(true)
  const batchLiveCount = { current: 0 }
  const batchTickerShares = new Map<string, number>()
  try {
    for (let i = 0; i < list.length; i++) {
      if (cancelRef.current) break
      const t = list[i]!
      cb.onProgress?.({ current: i + 1, total: list.length, taskName: t.name })
      const r = await runOne(t, settings, cb, {
        batch: true,
        cancelRef,
        runOpts: runOptsFactory(t),
        batchLiveCount,
        batchTickerShares
      })
      if (r === 'aborted' || r === 'cancelled' || r === 'error_stop') break
      const delay = settings.staggerDelaySec
      if (delay > 0 && i < list.length - 1 && !cancelRef.current) {
        await new Promise((res) => setTimeout(res, delay * 1000))
      }
    }
  } finally {
    cb.onProgress?.(null)
    cb.setRunning(false)
    cancelRef.current = false
    void window.api.notifyShow({
      title: 'AutoRSA batch finished',
      body: `Completed batch of ${list.length} task(s).`
    })
  }
}

export function sortTasksInGroup(tasks: TaskRow[], groupId: string): TaskRow[] {
  return tasks
    .filter((t) => t.groupId === groupId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
}

export function moveTask(tasks: TaskRow[], taskId: string, dir: -1 | 1): TaskRow[] {
  const t = tasks.find((x) => x.id === taskId)
  if (!t) return tasks
  const group = sortTasksInGroup(tasks, t.groupId)
  const idx = group.findIndex((x) => x.id === taskId)
  const swapIdx = idx + dir
  if (swapIdx < 0 || swapIdx >= group.length) return tasks
  const a = group[idx]!
  const b = group[swapIdx]!
  const orderA = a.sortOrder ?? idx
  const orderB = b.sortOrder ?? swapIdx
  return tasks.map((x) => {
    if (x.id === a.id) return { ...x, sortOrder: orderB }
    if (x.id === b.id) return { ...x, sortOrder: orderA }
    return x
  })
}

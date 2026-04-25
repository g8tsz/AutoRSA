import { useEffect, useMemo, useState } from 'react'
import type { Store, TaskRow } from './types'

type NavSetter = (id: 'tasks' | 'settings' | 'dashboard') => void

function relTime(iso: string | undefined, now: number): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const s = Math.floor((now - t) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function groupNameById(store: Store, id: string): string {
  return store.groups.find((g) => g.id === id)?.name ?? 'Group'
}

export function DashboardView({
  store,
  running,
  setNav,
  onViewErrorTasks
}: {
  store: Store
  running: boolean
  setNav: NavSetter
  onViewErrorTasks: () => void
}): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 2000)
    return () => clearInterval(id)
  }, [])

  const s = useMemo(() => {
    const tasks = store.tasks
    const nRunningRow = tasks.filter((t) => t.status === 'running').length
    // Parent `running` is true while a CLI is in flight; if rows not updated yet, still show 1 active.
    const nRunning = Math.max(nRunningRow, running && nRunningRow === 0 ? 1 : 0)
    const byStatus = {
      idle: tasks.filter((t) => t.status === 'idle').length,
      running: nRunning,
      ok: tasks.filter((t) => t.status === 'ok').length,
      error: tasks.filter((t) => t.status === 'error').length
    }
    const ok = byStatus.ok
    const err = byStatus.error
    const finished = ok + err
    const successPct = finished > 0 ? Math.round((ok / finished) * 100) : null

    const buy = tasks.filter((t) => t.mode === 'buy').length
    const sell = tasks.filter((t) => t.mode === 'sell').length
    const hold = tasks.filter((t) => t.mode === 'holdings').length
    const dry = tasks.filter((t) => t.dry).length
    const live = tasks.length - dry

    const day = 24 * 60 * 60 * 1000
    const wk = 7 * day
    const runs24 = tasks.filter(
      (t) => t.lastRun && new Date(t.lastRun).getTime() > now - day
    ).length
    const runs7d = tasks.filter(
      (t) => t.lastRun && new Date(t.lastRun).getTime() > now - wk
    ).length

    const byGroup = store.groups
      .map((g) => ({
        name: g.name,
        n: tasks.filter((t) => t.groupId === g.id).length
      }))
      .sort((a, b) => b.n - a.n)

    const withErr = tasks.filter((t) => t.lastError).length

    const recent = [...tasks]
      .filter((t) => t.lastRun)
      .sort(
        (a, b) =>
          new Date(b.lastRun!).getTime() - new Date(a.lastRun!).getTime()
      )
      .slice(0, 10)

    return {
      byStatus,
      successPct,
      finished,
      buy,
      sell,
      hold,
      dry,
      live,
      runs24,
      runs7d,
      byGroup,
      withErr,
      recent,
      ok,
      err
    }
  }, [store, running, now])

  const { byStatus, successPct, buy, sell, hold, dry, live, runs24, runs7d, byGroup, withErr, recent, ok, err, finished } = s
  const total = store.tasks.length

  const sparkBins = useMemo(() => {
    const out = [0, 0, 0, 0, 0, 0, 0]
    const day0 = (t: number) => {
      const d = new Date(t)
      d.setHours(0, 0, 0, 0)
      return d.getTime()
    }
    const today0 = day0(now)
    const firstBin = today0 - 6 * 24 * 60 * 60 * 1000
    for (const t of store.tasks) {
      if (!t.lastRun) continue
      const r = new Date(t.lastRun).getTime()
      const b = day0(r)
      const i = Math.round((b - firstBin) / (24 * 60 * 60 * 1000))
      if (i >= 0 && i <= 6) out[i] += 1
    }
    return out
  }, [store.tasks, now])

  const maxSpark = Math.max(1, ...sparkBins)

  if (total === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 overflow-y-auto bg-surface px-6 py-12 text-center">
        <div className="max-w-md rounded-md border-2 border-surface-border bg-surface-raised p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-100">No tasks yet</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Create a task to run buy, sell, or holdings against your brokerages. Set your .env
            directory and Python venv in Settings first.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => setNav('tasks')}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-950/40 transition hover:bg-indigo-500"
            >
              Open Tasks
            </button>
            <button
              type="button"
              onClick={() => setNav('settings')}
              className="rounded-md border border-surface-border bg-zinc-800/80 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-800"
            >
              Settings
            </button>
          </div>
        </div>
        <p className="text-[11px] text-zinc-600">Snapshot refreshes every 2s · {new Date(now).toLocaleString()}</p>
      </div>
    )
  }

  const hero =
    successPct != null
      ? { value: `${successPct}%`, sub: 'Success rate (finished runs)', hint: `Based on ${finished} completed` }
      : { value: String(runs7d), sub: 'Runs in the last 7 days', hint: 'Per-task run timestamps' }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-surface p-4 md:p-6">
      <p className="mb-3 text-center text-[11px] text-zinc-600 md:text-left">
        Live snapshot · updates every 2s · relative times refresh
      </p>

      <div className="mb-5 rounded-md border-2 border-surface-border bg-surface-raised p-5 md:p-6">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Focus</p>
        <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-zinc-50 transition-opacity duration-200 md:text-5xl">
          {hero.value}
        </p>
        <p className="mt-0.5 text-sm text-zinc-300">{hero.sub}</p>
        <p className="mt-1 text-[11px] text-zinc-500">{hero.hint}</p>
        <div className="mt-4 h-10 w-full max-w-md">
          <Sparkline7 values={sparkBins} maxY={maxSpark} color="rgb(99 102 241)" dimColor="rgb(39 39 42)" />
        </div>
        <p className="mt-1 text-[10px] text-zinc-500">7-day run volume (per calendar day, local time)</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <Tile label="Task groups" value={String(store.groups.length)} sub="saved groups" />
        <Tile label="Total tasks" value={String(total)} sub="across all groups" />
        <Tile
          label="Active now"
          value={String(byStatus.running)}
          sub="running in session"
          accent={byStatus.running > 0}
        />
        <Tile label="Succeeded" value={String(ok)} sub="last status ok" good />
        <Tile label="Failed" value={String(err)} sub="last status error" bad={err > 0} />
        <Tile
          label="Success rate"
          value={successPct == null ? '—' : `${successPct}%`}
          sub={finished > 0 ? `of ${finished} completed` : 'no finished runs yet'}
        />
        <Tile label="Runs (24h)" value={String(runs24)} sub="with a lastRun time" />
        <Tile label="Runs (7d)" value={String(runs7d)} sub="with a lastRun time" />
        <Tile label="Dry-run tasks" value={String(dry)} sub="paper / test" />
        <Tile label="Live profile" value={String(live)} sub="not dry" warn={live > 0} />
        {withErr > 0 ? (
          <button
            type="button"
            onClick={onViewErrorTasks}
            className="w-full min-w-0 text-left transition hover:opacity-90"
            title="View tasks with errors in Tasks"
          >
            <Tile
              label="With error text"
              value={String(withErr)}
              sub="open Tasks (error filter)"
              bad
            />
          </button>
        ) : (
          <Tile label="With error text" value={String(withErr)} sub="see task row" />
        )}
        <Tile label="Idle" value={String(byStatus.idle)} sub="not run yet" />
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border-2 border-surface-border bg-surface-raised p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Task type mix
          </h2>
          <div className="mb-2 flex h-2 overflow-hidden rounded-full bg-zinc-800">
            {total > 0 ? (
              <>
                <Bar w={(hold / total) * 100} c="bg-indigo-500" />
                <Bar w={(buy / total) * 100} c="bg-emerald-500" />
                <Bar w={(sell / total) * 100} c="bg-amber-500" />
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-zinc-400">
            <span>
              <span className="inline-block h-2 w-2 rounded-sm bg-indigo-500" /> Holdings{' '}
              <strong className="text-zinc-200">{hold}</strong>
            </span>
            <span>
              <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> Buy{' '}
              <strong className="text-zinc-200">{buy}</strong>
            </span>
            <span>
              <span className="inline-block h-2 w-2 rounded-sm bg-amber-500" /> Sell{' '}
              <strong className="text-zinc-200">{sell}</strong>
            </span>
          </div>
        </div>

        <div className="rounded-md border-2 border-surface-border bg-surface-raised p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Outcome mix (last status)
          </h2>
          <div className="mb-2 flex h-2 overflow-hidden rounded-full bg-zinc-800">
            {total > 0 ? (
              <>
                <Bar w={(byStatus.idle / total) * 100} c="bg-zinc-600" />
                <Bar w={(byStatus.running / total) * 100} c="bg-amber-500" />
                <Bar w={(ok / total) * 100} c="bg-emerald-600" />
                <Bar w={(err / total) * 100} c="bg-red-600" />
              </>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-zinc-400 sm:grid-cols-4">
            <span>
              Idle <strong className="text-zinc-200">{byStatus.idle}</strong>
            </span>
            <span>
              Running <strong className="text-amber-200">{byStatus.running}</strong>
            </span>
            <span>
              OK <strong className="text-emerald-200">{ok}</strong>
            </span>
            <span>
              Error <strong className="text-red-300">{err}</strong>
            </span>
          </div>
        </div>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border-2 border-surface-border bg-surface-raised p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Tasks per group
          </h2>
          <ul className="space-y-1.5 text-[12px]">
            {byGroup.length === 0 ? (
              <li className="text-zinc-500">No groups</li>
            ) : (
              byGroup.map((g) => (
                <li key={g.name} className="flex items-center justify-between gap-2">
                  <span className="truncate text-zinc-300">{g.name}</span>
                  <span className="shrink-0 font-mono text-zinc-500">{g.n}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-md border-2 border-surface-border bg-surface-raised p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Paths (from Settings)
          </h2>
          <dl className="space-y-2 text-[11px] text-zinc-400">
            <div>
              <dt className="text-zinc-500">.env / working directory</dt>
              <dd className="font-mono break-all text-zinc-300">
                {store.settings.envDirectory || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">auto_rsa_bot</dt>
              <dd className="font-mono break-all text-zinc-300">
                {store.settings.autoRsaExecutable || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Log cap / timeout</dt>
              <dd className="text-zinc-300">
                {store.settings.maxLogChars.toLocaleString()} chars
                {store.settings.commandTimeoutSec > 0
                  ? ` · timeout ${store.settings.commandTimeoutSec}s`
                  : ' · no command timeout'}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="rounded-md border-2 border-surface-border bg-surface-raised p-0">
        <div className="border-b border-surface-border px-4 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Recent runs (by last run time)
          </h2>
        </div>
        <div className="max-h-72 overflow-auto">
          {recent.length === 0 ? (
            <p className="p-4 text-sm text-zinc-500">No completed runs with timestamps yet.</p>
          ) : (
            <table className="w-full border-collapse text-left text-[12px]">
              <thead className="sticky top-0 bg-[#12121a] text-zinc-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Task</th>
                  <th className="px-2 py-2">Group</th>
                  <th className="px-2 py-2">Mode</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr
                    key={t.id + (t.lastRun ?? '')}
                    className="border-b border-surface-border/50 hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-2 font-medium text-zinc-200">{t.name}</td>
                    <td className="px-2 py-2 text-zinc-400">
                      {groupNameById(store, t.groupId)}
                    </td>
                    <td className="px-2 py-2 capitalize text-zinc-400">{t.mode}</td>
                    <td className="px-2 py-2">
                      <StatusPill status={t.status} />
                    </td>
                    <td className="px-2 py-2 text-zinc-500">
                      {relTime(t.lastRun, now)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function Tile({
  label,
  value,
  sub,
  accent,
  good,
  bad,
  warn
}: {
  label: string
  value: string
  sub: string
  accent?: boolean
  good?: boolean
  bad?: boolean
  warn?: boolean
}): React.JSX.Element {
  return (
    <div
      className={
        'rounded-md border-2 p-2.5 ' +
        (bad
          ? 'border-red-500/25 bg-red-500/5'
          : good
            ? 'border-emerald-500/25 bg-emerald-500/5'
            : warn
              ? 'border-amber-500/30 bg-amber-500/5'
              : accent
                ? 'border-accent/30 bg-accent/5'
                : 'border-surface-border bg-surface-raised/60')
      }
    >
      <div className="text-[10px] uppercase text-zinc-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums text-zinc-100">{value}</div>
      <div className="text-[10px] text-zinc-600">{sub}</div>
    </div>
  )
}

function Sparkline7({
  values,
  maxY,
  color,
  dimColor
}: {
  values: number[]
  maxY: number
  color: string
  dimColor: string
}): React.JSX.Element {
  const w = 160
  const h = 40
  const pad = 2
  const n = values.length
  if (n === 0) return <></>
  const step = n > 1 ? (w - pad * 2) / (n - 1) : 0
  const points = values.map((v, i) => {
    const x = pad + i * step
    const y = h - pad - (v / maxY) * (h - pad * 2)
    return `${x},${y}`
  })
  const line = `M${points[0]}` + points.slice(1).map((p) => ` L${p}`).join('')
  const lastY = h - pad - (values[n - 1]! / maxY) * (h - pad * 2)
  const area = `${line} L${pad + (n - 1) * step},${h - pad} L${pad},${h - pad} Z`

  return (
    <svg
      className="h-full w-full overflow-visible"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={area} fill={dimColor} fillOpacity={0.35} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={pad + (n - 1) * step} cy={lastY} r={2.5} fill={color} />
    </svg>
  )
}

function Bar({ w, c }: { w: number; c: string }): React.JSX.Element {
  const width = Math.max(0, Math.min(100, w))
  if (width < 0.1) return <></>
  return <div className={c} style={{ width: `${width}%` }} />
}

function StatusPill({ status }: { status: TaskRow['status'] }): React.JSX.Element {
  const map = {
    idle: 'bg-zinc-600/30 text-zinc-400',
    running: 'bg-amber-500/20 text-amber-200',
    ok: 'bg-emerald-500/20 text-emerald-200',
    error: 'bg-red-500/20 text-red-200'
  }
  return (
    <span
      className={
        'inline-block rounded px-1.5 py-0.5 text-[10px] uppercase ' + (map[status] ?? map.idle)
      }
    >
      {status}
    </span>
  )
}

import type { AppSettings, TaskRow } from '../types'

export type BuildCliOpts = {
  /** When set, replaces task.brokers for this run only (e.g. subset chosen in UI for `all`). */
  brokerOverride?: string
  /** When set, replaces task.notBrokers for this run only. */
  notBrokersOverride?: string
}

/** Non-null message if the task should not be sent to the CLI yet. */
export function taskRunPreflight(task: TaskRow, opts?: BuildCliOpts): string | null {
  const brokers = (opts?.brokerOverride ?? task.brokers).trim()
  if (!brokers) {
    return (
      'Brokers is empty. Enter broker names (e.g. robinhood,schwab), a keyword like day1 or most, ' +
      'or all only if every broker you need is configured in .env. To skip brokers, use all plus Exclude brokers (e.g. webull,wellsfargo).'
    )
  }
  if (task.mode === 'buy' || task.mode === 'sell') {
    if (!task.tickers.trim()) {
      return 'Tickers is empty. Buy and sell need at least one ticker (e.g. AAPL).'
    }
  }
  return null
}

export function isEffectiveDry(
  task: TaskRow,
  settings: Pick<AppSettings, 'forceDryRun'>
): boolean {
  return settings.forceDryRun || task.dry
}

export function buildCliArgs(
  task: TaskRow,
  settings: Pick<AppSettings, 'forceDryRun'>,
  opts?: BuildCliOpts
): string[] {
  const useDry = isEffectiveDry(task, settings)
  const dryLast = useDry ? 'true' : 'false'
  const b = (opts?.brokerOverride ?? task.brokers).trim().toLowerCase()
  if (!b) {
    throw new Error('Brokers is empty — taskRunPreflight should run before buildCliArgs.')
  }
  const nb = (opts?.notBrokersOverride ?? task.notBrokers).trim().toLowerCase()

  if (task.mode === 'holdings') {
    const parts: string[] = ['holdings', b]
    if (nb) {
      parts.push('not', nb)
    }
    return parts
  }

  const tickers = task.tickers.trim().toLowerCase()
  const parts: string[] = [task.mode, String(task.amount ?? 0), tickers, b]
  if (nb) {
    parts.push('not', nb)
  }
  parts.push(dryLast)
  return parts
}

export function formatCommandLine(exe: string, args: string[]): string {
  return `${exe} ${args.join(' ')}`
}

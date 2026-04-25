import type { TaskRow } from '../types'

export function buildCliArgs(task: TaskRow): string[] {
  const dryLast = task.dry ? 'true' : 'false'
  const b = task.brokers.trim().toLowerCase() || 'all'
  const nb = task.notBrokers.trim().toLowerCase()

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

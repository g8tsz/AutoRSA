import type { TaskRow } from '../types'

/** Broker slugs AutoRSA accepts individually (same order as typical `all` runs). */
export const ALL_BROKER_SLUGS = [
  'bbae',
  'chase',
  'dspac',
  'fennel',
  'fidelity',
  'firstrade',
  'public',
  'robinhood',
  'schwab',
  'sofi',
  'tastytrade',
  'tornado',
  'tradier',
  'vanguard',
  'webull',
  'wellsfargo'
] as const

export const BROKER_ENV_KEYS: Record<string, string[]> = {
  bbae: ['BBAE'],
  chase: ['CHASE'],
  dspac: ['DSPAC'],
  fennel: ['FENNEL'],
  fidelity: ['FIDELITY'],
  firstrade: ['FIRSTRADE'],
  public: ['PUBLIC_BROKER'],
  robinhood: ['ROBINHOOD'],
  schwab: ['SCHWAB'],
  sofi: ['SOFI'],
  tastytrade: ['TASTYTRADE'],
  tornado: ['TORNADO'],
  tradier: ['TRADIER'],
  vanguard: ['VANGUARD'],
  webull: ['WEBULL'],
  wellsfargo: ['WELLSFARGO']
}

export function taskUsesAllBrokers(task: TaskRow): boolean {
  return task.brokers.trim().toLowerCase() === 'all'
}

/** Map checkbox set to CLI broker argument (literal `all` if every slug selected). */
export function selectionToBrokerCliArg(selected: ReadonlySet<string>): string | null {
  if (selected.size === 0) return null
  const full = ALL_BROKER_SLUGS.length
  if (selected.size === full && ALL_BROKER_SLUGS.every((b) => selected.has(b))) {
    return 'all'
  }
  return ALL_BROKER_SLUGS.filter((b) => selected.has(b)).join(',')
}

export function parseBrokerList(raw: string): string[] {
  const t = raw.trim().toLowerCase()
  if (!t) return []
  if (t === 'all') return [...ALL_BROKER_SLUGS]
  return t
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
}

export function missingEnvByBroker(selectedBrokers: string[], envKeys: string[]): Record<string, string[]> {
  const set = new Set(envKeys)
  const out: Record<string, string[]> = {}
  for (const b of selectedBrokers) {
    const needed = BROKER_ENV_KEYS[b] ?? [b.toUpperCase()]
    const miss = needed.filter((k) => !set.has(k))
    if (miss.length > 0) out[b] = miss
  }
  return out
}

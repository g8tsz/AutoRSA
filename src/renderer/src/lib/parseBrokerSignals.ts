import { ALL_BROKER_SLUGS, BROKER_ENV_KEYS } from './brokers'

export type BrokerSignalStatus = 'ok' | 'error' | 'skipped'

export type BrokerSignal = { broker: string; status: BrokerSignalStatus; detail?: string }

const KNOWN = new Set<string>(ALL_BROKER_SLUGS)

function normalizeBroker(raw: string): string | null {
  const s = raw.trim().toLowerCase()
  return KNOWN.has(s) ? s : null
}

function envKeyToSlugMap(): Map<string, string> {
  const m = new Map<string, string>()
  for (const [slug, keys] of Object.entries(BROKER_ENV_KEYS)) {
    for (const k of keys) {
      m.set(k.toUpperCase(), slug)
    }
  }
  return m
}

const ENV_KEY_TO_SLUG = envKeyToSlugMap()

const MAX_CHIPS = 20

/**
 * Derive per-broker status chips from AutoRSA CLI log lines.
 * Only recognizes known broker slugs to avoid spurious single-letter matches.
 */
export function parseBrokerSignals(log: string): BrokerSignal[] {
  const map = new Map<string, BrokerSignal>()

  const setError = (broker: string, detail: string) => {
    map.set(broker, { broker, status: 'error', detail })
  }

  const setSkipped = (broker: string, detail: string) => {
    const cur = map.get(broker)
    if (cur?.status === 'error') return
    map.set(broker, { broker, status: 'skipped', detail })
  }

  const lines = log.split(/\r?\n/)
  for (const ln of lines) {
    const errWith = ln.match(/\bError with ([a-z0-9_]+):/i)
    if (errWith) {
      const b = normalizeBroker(errWith[1]!)
      if (b) setError(b, ln.trim())
      continue
    }

    const errIn = ln.match(/\bError in ([a-z0-9_]+):/i)
    if (errIn) {
      const b = normalizeBroker(errIn[1]!)
      if (b) setError(b, ln.trim())
      continue
    }

    const notFound = ln.match(/^([A-Za-z][a-z0-9_]*)\s+not found,\s*skipping/i)
    if (notFound) {
      const b = normalizeBroker(notFound[1]!)
      if (b) setSkipped(b, ln.trim())
      continue
    }

    const envMiss = ln.match(/^([A-Z0-9_]+)\s+environment variable not found\.?/i)
    if (envMiss) {
      const slug = ENV_KEY_TO_SLUG.get(envMiss[1]!.toUpperCase())
      if (slug) setSkipped(slug, ln.trim())
      continue
    }

    const skipProf = ln.match(/Skipped broker[s]?:\s*(.+)$/i)
    if (skipProf) {
      for (const raw of skipProf[1]!.split(',').map((x) => x.trim()).filter(Boolean)) {
        const b = normalizeBroker(raw)
        if (b) setSkipped(b, 'Skipped by profile/preflight.')
      }
    }
  }

  const ordered: BrokerSignal[] = []
  for (const slug of ALL_BROKER_SLUGS) {
    const v = map.get(slug)
    if (v) ordered.push(v)
  }
  return ordered.slice(0, MAX_CHIPS)
}

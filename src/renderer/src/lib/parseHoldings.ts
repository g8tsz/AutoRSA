import type { HoldingsRow } from '../types'

/** Best-effort parse of holdings CLI log lines into structured rows. */
export function parseHoldingsFromLog(log: string): HoldingsRow[] {
  const rows: HoldingsRow[] = []
  const seen = new Set<string>()
  for (const ln of log.split(/\r?\n/)) {
    // "robinhood: AAPL 10" or "AAPL: 10 shares at robinhood"
    const m1 = ln.match(/\b([a-z0-9_]+)\s*:\s*([A-Z0-9.]+)\s+([\d.]+)/i)
    if (m1) {
      const broker = m1[1]!.toLowerCase()
      const ticker = m1[2]!.toUpperCase()
      const qty = m1[3]!
      const key = `${broker}|${ticker}`
      if (!seen.has(key)) {
        seen.add(key)
        rows.push({ broker, ticker, quantity: qty })
      }
      continue
    }
    const m2 = ln.match(/\b([A-Z0-9.]{1,6})\b.*?\b([\d.]+)\s*(?:shares?|qty)?/i)
    const brokerMatch = ln.match(/\b(robinhood|schwab|fidelity|webull|vanguard|wellsfargo|tastytrade|tradier|sofi|public|firstrade|chase|bbae|dspac|fennel|tornado)\b/i)
    if (m2 && brokerMatch) {
      const key = `${brokerMatch[1]!.toLowerCase()}|${m2[1]!.toUpperCase()}`
      if (!seen.has(key)) {
        seen.add(key)
        rows.push({
          broker: brokerMatch[1]!.toLowerCase(),
          ticker: m2[1]!.toUpperCase(),
          quantity: m2[2]!
        })
      }
    }
  }
  return rows
}

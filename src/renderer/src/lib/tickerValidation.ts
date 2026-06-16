import { COMMON_TICKERS } from '../../../shared/constants'

export function suggestTickers(input: string): string[] {
  const q = input.trim().toLowerCase()
  if (!q) return [...COMMON_TICKERS].slice(0, 8)
  return COMMON_TICKERS.filter((t) => t.startsWith(q) || t.includes(q)).slice(0, 8)
}

export function validateTickerList(raw: string): string[] {
  const warnings: string[] = []
  for (const t of raw.split(',').map((x) => x.trim()).filter(Boolean)) {
    if (t.length > 6) warnings.push(`"${t}" looks unusually long for a ticker.`)
    if (!/^[a-z0-9.]+$/i.test(t)) warnings.push(`"${t}" has unexpected characters.`)
  }
  return warnings
}

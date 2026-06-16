import type { HoldingsRow, HoldingsSnapshot } from '../types'

export type HoldingsDiffRow = {
  broker: string
  ticker: string
  before: string | null
  after: string | null
  changed: boolean
}

export function diffHoldingsSnapshots(
  a: HoldingsSnapshot | undefined,
  b: HoldingsSnapshot | undefined
): HoldingsDiffRow[] {
  if (!a || !b) return []
  const mapA = new Map<string, string>()
  const mapB = new Map<string, string>()
  for (const r of a.rows) mapA.set(`${r.broker}|${r.ticker}`, r.quantity)
  for (const r of b.rows) mapB.set(`${r.broker}|${r.ticker}`, r.quantity)
  const keys = new Set([...mapA.keys(), ...mapB.keys()])
  const out: HoldingsDiffRow[] = []
  for (const k of keys) {
    const [broker, ticker] = k.split('|')
    const before = mapA.get(k) ?? null
    const after = mapB.get(k) ?? null
    out.push({
      broker: broker!,
      ticker: ticker!,
      before,
      after,
      changed: before !== after
    })
  }
  return out.sort((x, y) => x.broker.localeCompare(y.broker) || x.ticker.localeCompare(y.ticker))
}

export function snapshotFromRows(
  taskId: string,
  taskName: string,
  rows: HoldingsRow[],
  rawLog?: string
): HoldingsSnapshot {
  return {
    id: crypto.randomUUID(),
    taskId,
    taskName,
    createdAt: new Date().toISOString(),
    rows,
    rawLog
  }
}

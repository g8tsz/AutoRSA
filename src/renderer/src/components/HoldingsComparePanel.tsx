import { diffHoldingsSnapshots } from '../lib/holdingsDiff'
import type { HoldingsSnapshot } from '../types'

export function HoldingsComparePanel({
  snapshots
}: {
  snapshots: HoldingsSnapshot[]
}): React.JSX.Element | null {
  if (snapshots.length < 2) return null
  const [a, b] = [snapshots[1], snapshots[0]]
  const diff = diffHoldingsSnapshots(a, b)
  const changed = diff.filter((d) => d.changed)
  if (changed.length === 0) return null

  return (
    <div className="rounded border border-surface-border bg-surface-raised p-3">
      <h3 className="text-xs font-semibold text-zinc-400">Holdings changes (last 2 snapshots)</h3>
      <table className="mt-2 w-full text-left text-[11px]">
        <thead className="text-zinc-500">
          <tr>
            <th className="px-1 py-0.5">Broker</th>
            <th className="px-1 py-0.5">Ticker</th>
            <th className="px-1 py-0.5">Before</th>
            <th className="px-1 py-0.5">After</th>
          </tr>
        </thead>
        <tbody>
          {changed.map((r) => (
            <tr key={`${r.broker}-${r.ticker}`} className="border-t border-surface-border/40">
              <td className="px-1 py-0.5 lowercase">{r.broker}</td>
              <td className="px-1 py-0.5">{r.ticker}</td>
              <td className="px-1 py-0.5 font-mono text-zinc-500">{r.before ?? '—'}</td>
              <td className="px-1 py-0.5 font-mono text-emerald-300">{r.after ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

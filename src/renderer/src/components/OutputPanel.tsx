import { useMemo, useState } from 'react'
import { parseBrokerSignals } from '../lib/parseBrokerSignals'
import { parseHoldingsFromLog } from '../lib/parseHoldings'

type Props = {
  log: string
  onClear: () => void
  onSave: () => void
  heightPx: number
  onHeightChange: (h: number) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export function OutputPanel({
  log,
  onClear,
  onSave,
  heightPx,
  onHeightChange,
  collapsed,
  onToggleCollapse
}: Props): React.JSX.Element {
  const [filter, setFilter] = useState('')
  const brokerSignals = useMemo(() => parseBrokerSignals(log), [log])
  const holdings = useMemo(() => parseHoldingsFromLog(log), [log])

  const displayLog = useMemo(() => {
    if (!filter.trim()) return log
    const q = filter.toLowerCase()
    return log
      .split(/\r?\n/)
      .filter((ln) => ln.toLowerCase().includes(q))
      .join('\n')
  }, [log, filter])

  if (collapsed) {
    return (
      <div className="shrink-0 border-t-2 border-surface-border bg-surface-raised px-2 py-1">
        <button type="button" className="text-[11px] text-indigo-400" onClick={onToggleCollapse}>
          Show output
        </button>
      </div>
    )
  }

  return (
    <div className="shrink-0 border-t-2 border-surface-border bg-surface-raised p-2" style={{ height: heightPx }}>
      <div className="mb-1 flex flex-wrap items-center gap-2 border-b border-surface-border pb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
        <span>Output</span>
        <input
          className="ml-2 min-w-[120px] flex-1 rounded border border-surface-border bg-[#0c0c0e] px-2 py-0.5 text-[10px] normal-case"
          placeholder="Filter log…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <div className="flex flex-wrap gap-1">
          {brokerSignals.map((b) => (
            <span
              key={b.broker}
              className={
                'rounded px-1.5 py-0.5 text-[10px] lowercase normal-case ' +
                (b.status === 'ok'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : b.status === 'error'
                    ? 'bg-red-500/20 text-red-300'
                    : 'bg-amber-500/20 text-amber-200')
              }
            >
              {b.broker}:{b.status}
            </span>
          ))}
        </div>
        <button type="button" className="text-indigo-400 hover:text-indigo-300" onClick={onSave}>
          Save
        </button>
        <button type="button" className="text-indigo-400 hover:text-indigo-300" onClick={onClear}>
          Clear
        </button>
        <button type="button" className="text-zinc-500" onClick={onToggleCollapse}>
          Collapse
        </button>
        <input
          type="range"
          min={120}
          max={480}
          value={heightPx}
          onChange={(e) => onHeightChange(Number(e.target.value))}
          className="w-16"
          title="Panel height"
        />
      </div>
      {holdings.length > 0 && (
        <div className="mb-1 max-h-24 overflow-auto rounded border border-surface-border bg-[#0a0a0c]">
          <table className="w-full text-left text-[10px]">
            <thead className="text-zinc-500">
              <tr>
                <th className="px-2 py-0.5">Broker</th>
                <th className="px-2 py-0.5">Ticker</th>
                <th className="px-2 py-0.5">Qty</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => (
                <tr key={`${h.broker}-${h.ticker}`} className="border-t border-surface-border/40">
                  <td className="px-2 py-0.5 lowercase text-zinc-400">{h.broker}</td>
                  <td className="px-2 py-0.5 text-zinc-200">{h.ticker}</td>
                  <td className="px-2 py-0.5 font-mono text-zinc-300">{h.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <pre className="h-[calc(100%-3rem)] overflow-auto rounded-sm border border-surface-border bg-[#0a0a0c] p-2 font-mono text-[11px] text-zinc-300">
        {displayLog || 'Run a task to see output.'}
      </pre>
    </div>
  )
}

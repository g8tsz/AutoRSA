import { useMemo, useState } from 'react'
import { buildCliArgs, formatCommandLine } from '../lib/buildArgs'
import { validateTask } from '../lib/taskValidation'
import { suggestTickers, validateTickerList } from '../lib/tickerValidation'
import { BrokerCheckboxPicker } from './BrokerCheckboxPicker'
import type { AppSettings, TaskRow } from '../types'

export function TaskEditor({
  task,
  settings,
  onClose,
  onSave
}: {
  task: TaskRow
  settings: AppSettings
  onClose: () => void
  onSave: (t: TaskRow) => void
}): React.JSX.Element {
  const [d, setD] = useState<TaskRow>(task)
  const issues = useMemo(() => validateTask(d), [d])
  const tickerWarnings = useMemo(() => validateTickerList(d.tickers), [d.tickers])
  const cmdPreview = useMemo(() => {
    try {
      const args = buildCliArgs(d, settings)
      return formatCommandLine(settings.autoRsaExecutable, args)
    } catch {
      return '(invalid — fix brokers first)'
    }
  }, [d, settings])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md border-2 border-surface-border bg-surface-raised p-4 shadow-xl">
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">Edit task</h2>
        {issues.length > 0 && (
          <ul className="mb-2 list-disc pl-4 text-[11px] text-amber-300">
            {issues.map((i) => (
              <li key={i.field}>{i.message}</li>
            ))}
          </ul>
        )}
        <div className="space-y-2 text-xs">
          <Labeled label="Name" value={d.name} onChange={(v) => setD((x) => ({ ...x, name: v }))} />
          <label className="block text-zinc-500">
            Mode
            <select
              className="mt-0.5 w-full rounded border border-surface-border bg-[#0c0c0e] px-2 py-1.5"
              value={d.mode}
              onChange={(e) => setD((x) => ({ ...x, mode: e.target.value as TaskRow['mode'] }))}
            >
              <option value="holdings">holdings</option>
              <option value="buy">buy</option>
              <option value="sell">sell</option>
            </select>
          </label>
          {d.mode !== 'holdings' && (
            <>
              <Labeled
                label="Amount (shares)"
                value={String(d.amount)}
                onChange={(v) => setD((x) => ({ ...x, amount: Number(v) || 0 }))}
              />
              <Labeled
                label="Tickers (comma-separated)"
                value={d.tickers}
                onChange={(v) => setD((x) => ({ ...x, tickers: v }))}
              />
              {d.tickers && (
                <div className="flex flex-wrap gap-1">
                  {suggestTickers(d.tickers.split(',').pop() ?? '').map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400"
                      onClick={() =>
                        setD((x) => ({
                          ...x,
                          tickers: x.tickers ? `${x.tickers},${t}` : t
                        }))
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
              {tickerWarnings.map((w) => (
                <p key={w} className="text-[10px] text-amber-400">
                  {w}
                </p>
              ))}
            </>
          )}
          <BrokerCheckboxPicker
            brokers={d.brokers}
            notBrokers={d.notBrokers}
            onBrokersChange={(v) => setD((x) => ({ ...x, brokers: v }))}
            onNotBrokersChange={(v) => setD((x) => ({ ...x, notBrokers: v }))}
          />
          <label className="flex items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              checked={d.dry}
              onChange={(e) => setD((x) => ({ ...x, dry: e.target.checked }))}
            />
            Dry run (no real orders)
          </label>
          <div className="rounded border border-surface-border bg-[#0a0a0c] p-2 font-mono text-[10px] text-zinc-500">
            Preview: {cmdPreview}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-md border border-surface-border px-3 py-1.5 text-xs" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={issues.some((i) => i.field !== 'amount' || !i.message.includes('100'))}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            onClick={() => onSave(d)}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function Labeled({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (v: string) => void
}): React.JSX.Element {
  return (
    <label className="block text-zinc-500">
      {label}
      <input
        className="mt-0.5 w-full rounded border border-surface-border bg-[#0c0c0e] px-2 py-1.5 text-zinc-200"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

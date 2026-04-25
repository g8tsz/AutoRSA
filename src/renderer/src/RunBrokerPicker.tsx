import { useEffect, useMemo, useState } from 'react'
import { ALL_BROKER_SLUGS, selectionToBrokerCliArg } from './lib/brokers'

type Props = {
  open: boolean
  title: string
  subtitle?: string
  onCancel: () => void
  onConfirm: (brokerCliArg: string) => void
}

const initialSelected = () => new Set<string>(ALL_BROKER_SLUGS)

export function RunBrokerPicker({ open, title, subtitle, onCancel, onConfirm }: Props): React.JSX.Element | null {
  const [selected, setSelected] = useState<Set<string>>(initialSelected)

  useEffect(() => {
    if (open) setSelected(initialSelected())
  }, [open])

  const cliArg = useMemo(() => selectionToBrokerCliArg(selected), [selected])

  if (!open) return null

  const toggle = (slug: string) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(slug)) n.delete(slug)
      else n.add(slug)
      return n
    })
  }

  const selectAll = () => setSelected(new Set(ALL_BROKER_SLUGS))
  const clearAll = () => setSelected(new Set())

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-md border-2 border-surface-border bg-surface-raised shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b-2 border-surface-border p-4">
          <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>
          {subtitle && <p className="mt-1 text-[11px] text-zinc-500">{subtitle}</p>}
          <p className="mt-2 text-[11px] text-zinc-500">
            Task uses <code className="text-indigo-300">all</code>. Choose which brokers to include for{' '}
            <strong>this run only</strong> (your saved task is unchanged).
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-md border border-surface-border bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300"
              onClick={selectAll}
            >
              Select all
            </button>
            <button
              type="button"
              className="rounded-md border border-surface-border bg-zinc-800 px-2 py-1 text-[11px] text-zinc-300"
              onClick={clearAll}
            >
              Clear all
            </button>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3">
            {ALL_BROKER_SLUGS.map((slug) => (
              <label
                key={slug}
                className="flex cursor-pointer items-center gap-2 text-[11px] capitalize text-zinc-300"
              >
                <input
                  type="checkbox"
                  checked={selected.has(slug)}
                  onChange={() => toggle(slug)}
                  className="rounded border-surface-border"
                />
                {slug}
              </label>
            ))}
          </div>
        </div>
        <div className="shrink-0 space-y-2 border-t-2 border-surface-border p-4">
          <div className="font-mono text-[10px] text-zinc-500">
            CLI brokers:{' '}
            <span className="text-indigo-300">{cliArg ?? '(pick at least one)'}</span>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-zinc-300"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={cliArg == null}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              onClick={() => {
                if (cliArg) onConfirm(cliArg)
              }}
            >
              Run with selection
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

export type ConfirmOptions = {
  title: string
  body: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'danger'
  /** Require typing this exact string to confirm (for live orders). */
  typeToConfirm?: string
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const [typed, setTyped] = useState('')
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o)
    setTyped('')
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const close = (v: boolean) => {
    setOpen(false)
    setOpts(null)
    setTyped('')
    resolver.current?.(v)
    resolver.current = null
  }

  const typeOk =
    !opts?.typeToConfirm || typed.trim() === opts.typeToConfirm.trim()

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {open && opts && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4">
          <div
            className="w-full max-w-lg rounded-md border-2 border-surface-border p-5 shadow-xl"
            style={{ background: 'rgb(var(--color-surface-raised) / 1)' }}
          >
            <h2 className="text-sm font-semibold text-zinc-100">{opts.title}</h2>
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-surface-border bg-[#0a0a0c] p-3 font-mono text-[11px] text-zinc-300">
              {opts.body}
            </pre>
            {opts.typeToConfirm && (
              <div className="mt-3">
                <label className="text-[11px] text-zinc-500">
                  Type <code className="text-amber-200">{opts.typeToConfirm}</code> to confirm
                  <input
                    className="mt-1 w-full rounded border border-surface-border bg-[#0c0c0e] px-2 py-1.5 font-mono text-xs"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoFocus
                  />
                </label>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-surface-border px-3 py-1.5 text-xs text-zinc-300"
                onClick={() => close(false)}
              >
                {opts.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!typeOk}
                className={
                  'rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40 ' +
                  (opts.variant === 'danger' ? 'bg-red-600 hover:bg-red-500' : 'bg-accent hover:bg-indigo-500')
                }
                onClick={() => close(true)}
              >
                {opts.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm requires ConfirmProvider')
  return ctx
}

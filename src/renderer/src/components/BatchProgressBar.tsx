import type { RunProgress } from '../lib/runOrchestration'

export function BatchProgressBar({ progress }: { progress: RunProgress | null }): React.JSX.Element | null {
  if (!progress) return null
  const pct = Math.round((progress.current / progress.total) * 100)
  return (
    <div className="border-b border-surface-border bg-indigo-500/10 px-3 py-2">
      <div className="flex items-center justify-between text-[11px] text-zinc-300">
        <span>
          Running task {progress.current} of {progress.total}: <strong>{progress.taskName}</strong>
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

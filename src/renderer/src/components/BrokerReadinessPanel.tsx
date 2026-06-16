import { ALL_BROKER_SLUGS, BROKER_ENV_KEYS } from '../lib/brokers'

export function BrokerReadinessPanel({ envKeys }: { envKeys: string[] }): React.JSX.Element {
  const set = new Set(envKeys)
  return (
    <div className="rounded border border-surface-border bg-[#0c0c0e] p-2">
      <div className="mb-2 text-[11px] font-medium text-zinc-400">Broker .env readiness</div>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
        {ALL_BROKER_SLUGS.map((slug) => {
          const needed = BROKER_ENV_KEYS[slug] ?? [slug.toUpperCase()]
          const ok = needed.every((k) => set.has(k))
          return (
            <div
              key={slug}
              className={
                'rounded px-1.5 py-0.5 text-[10px] capitalize ' +
                (ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-800 text-zinc-500')
              }
              title={ok ? 'Configured' : `Missing: ${needed.filter((k) => !set.has(k)).join(', ')}`}
            >
              {ok ? '✓' : '○'} {slug}
            </div>
          )
        })}
      </div>
    </div>
  )
}

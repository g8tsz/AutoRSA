import { ALL_BROKER_SLUGS, selectionToBrokerCliArg } from '../lib/brokers'

type Props = {
  brokers: string
  notBrokers: string
  onBrokersChange: (v: string) => void
  onNotBrokersChange: (v: string) => void
}

const KEYWORDS = ['all', 'day1', 'most'] as const

function parseSelection(brokers: string, notBrokers: string): {
  keyword: string | null
  selected: Set<string>
  excluded: Set<string>
} {
  const b = brokers.trim().toLowerCase()
  const keyword = KEYWORDS.includes(b as (typeof KEYWORDS)[number]) ? b : null
  const selected = keyword
    ? new Set(ALL_BROKER_SLUGS)
    : new Set(
        b
          .split(',')
          .map((x) => x.trim())
          .filter((x) => ALL_BROKER_SLUGS.includes(x as (typeof ALL_BROKER_SLUGS)[number]))
      )
  const excluded = new Set(
    notBrokers
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
  )
  return { keyword, selected, excluded }
}

export function BrokerCheckboxPicker({
  brokers,
  notBrokers,
  onBrokersChange,
  onNotBrokersChange
}: Props): React.JSX.Element {
  const { keyword, selected, excluded } = parseSelection(brokers, notBrokers)

  const setKeyword = (kw: string) => {
    onBrokersChange(kw)
  }

  const toggle = (slug: string, exclude: boolean) => {
    if (exclude) {
      const n = new Set(excluded)
      if (n.has(slug)) n.delete(slug)
      else n.add(slug)
      onNotBrokersChange([...n].join(','))
      return
    }
    const n = new Set(selected)
    if (n.has(slug)) n.delete(slug)
    else n.add(slug)
    const cli = selectionToBrokerCliArg(n)
    onBrokersChange(cli ?? '')
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {KEYWORDS.map((kw) => (
          <button
            key={kw}
            type="button"
            className={
              'rounded px-2 py-0.5 text-[10px] ' +
              (keyword === kw ? 'bg-accent text-white' : 'border border-surface-border text-zinc-400')
            }
            onClick={() => setKeyword(kw)}
          >
            {kw}
          </button>
        ))}
      </div>
      <div className="text-[10px] text-zinc-500">Include</div>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        {ALL_BROKER_SLUGS.map((slug) => (
          <label key={slug} className="flex items-center gap-1 text-[10px] capitalize text-zinc-300">
            <input
              type="checkbox"
              checked={keyword != null || selected.has(slug)}
              disabled={keyword != null}
              onChange={() => toggle(slug, false)}
            />
            {slug}
          </label>
        ))}
      </div>
      <div className="text-[10px] text-zinc-500">Exclude (optional)</div>
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
        {ALL_BROKER_SLUGS.map((slug) => (
          <label key={'ex-' + slug} className="flex items-center gap-1 text-[10px] capitalize text-zinc-400">
            <input type="checkbox" checked={excluded.has(slug)} onChange={() => toggle(slug, true)} />
            {slug}
          </label>
        ))}
      </div>
      <div className="font-mono text-[10px] text-zinc-500">
        CLI: <span className="text-indigo-300">{brokers || '(none)'}</span>
        {notBrokers ? ` · not ${notBrokers}` : ''}
      </div>
    </div>
  )
}

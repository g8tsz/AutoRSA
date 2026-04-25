import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DashboardView } from './Dashboard'
import {
  healthLevel,
  isReadyToRun,
  useEnvironmentHealth,
  type PathStatus
} from './hooks/useEnvironmentHealth'
import {
  buildCliArgs,
  formatCommandLine,
  isEffectiveDry,
  taskRunPreflight,
  type BuildCliOpts
} from './lib/buildArgs'
import { missingEnvByBroker, parseBrokerList, taskUsesAllBrokers } from './lib/brokers'
import { parseBrokerSignals } from './lib/parseBrokerSignals'
import { OnboardingWizard } from './OnboardingWizard'
import { trimLogEnd } from './lib/log'
import { SettingsPanel } from './SettingsPanel'
import type { AppSettings, RsaRunResult, Store, TaskGroup, TaskRow } from './types'

function newId(): string {
  return crypto.randomUUID()
}

const NAV = [
  { id: 'dashboard', label: 'Dashboard', kbd: 'Alt+D' },
  { id: 'tasks', label: 'Tasks', kbd: 'Alt+T' },
  { id: 'settings', label: 'Settings', kbd: 'Alt+S' }
] as const

type NavId = (typeof NAV)[number]['id']

const PAGE: Record<NavId, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Live overview of tasks and recent runs' },
  tasks: { title: 'Tasks', subtitle: 'Run buy, sell, and holdings against your brokerages' },
  settings: { title: 'Settings', subtitle: 'Environment, CLI, and safety limits' }
}

const defaultGroup = (id: string): TaskGroup => ({ id, name: 'Default' })
const defaultTask = (groupId: string): TaskRow => ({
  id: newId(),
  groupId,
  name: 'New task',
  mode: 'holdings',
  amount: 0,
  tickers: '',
  brokers: 'all',
  notBrokers: '',
  dry: true,
  status: 'idle'
})

export default function App(): React.JSX.Element {
  const [store, setStore] = useState<Store | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [nav, setNav] = useState<NavId>('tasks')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [groupSearch, setGroupSearch] = useState('')
  const [taskSearch, setTaskSearch] = useState('')
  const [log, setLog] = useState<string>('')
  const [editId, setEditId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [taskDensity, setTaskDensity] = useState<'comfortable' | 'compact'>(() => {
    try {
      const v = localStorage.getItem('arsa_task_density')
      return v === 'compact' || v === 'comfortable' ? v : 'comfortable'
    } catch {
      return 'comfortable'
    }
  })
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [taskFilter, setTaskFilter] = useState<'all' | 'errors'>('all')
  const [startAllModalOpen, setStartAllModalOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [tasksHelpOpen, setTasksHelpOpen] = useState(false)
  const [pathsForOnboarding, setPathsForOnboarding] = useState<{
    userData: string
    projectRoot: string
  } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxLogRef = useRef(400_000)
  const cancelBatchRef = useRef(false)

  const clock = useClock()
  const health = useEnvironmentHealth(store?.settings ?? null)
  const canRun = isReadyToRun(health)
  const brokerSignals = useMemo(() => parseBrokerSignals(log), [log])
  const runBlockedReason =
    health == null
      ? 'Checking paths on disk…'
      : !canRun
        ? 'Set a valid working directory and auto_rsa_bot in Settings (paths must exist on disk).'
        : null

  const flushSave = useCallback(
    (s: Store) => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void window.api.storeSave(s)
      }, 200)
    },
    []
  )

  const updateStore = useCallback(
    (updater: (prev: Store) => Store) => {
      setStore((prev) => {
        if (!prev) return prev
        const n = updater(prev)
        flushSave(n)
        return n
      })
    },
    [flushSave]
  )

  useEffect(() => {
    void window.api
      .storeLoad()
      .then((raw) => {
        const s: Store = {
          ...raw,
          runStats: raw.runStats ?? { ok: 0, err: 0 },
          runHistory: Array.isArray(raw.runHistory) ? raw.runHistory.slice(0, 50) : [],
          settings: {
            ...raw.settings,
            retryOnFailure: raw.settings.retryOnFailure ?? {
              enabled: false,
              maxAttempts: 2
            },
            brokerProfile: raw.settings.brokerProfile ?? {
              include: 'all',
              exclude: '',
              applyToAllKeyword: true
            },
            riskGuard: raw.settings.riskGuard ?? { enabled: true, maxSharesPerOrder: 1 }
          }
        }
        delete (s.settings as { theme?: unknown }).theme
        let g = s.groups
        let t = s.tasks
        if (g.length === 0) {
          const id = newId()
          g = [defaultGroup(id)]
          t = [defaultTask(id)]
          const next = { ...s, groups: g, tasks: t }
          void window.api.storeSave(next)
          setStore(next)
          setSelectedGroupId(g[0]!.id)
          return
        }
        setStore(s)
        setSelectedGroupId(g[0]!.id)
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : String(e))
      })
    void window.api.getPaths().then(setPathsForOnboarding)
  }, [])

  useEffect(() => {
    if (!store) return
    const h = healthLevel(health)
    const t =
      h === 'ok'
        ? 'AutoRSA Desktop'
        : h === 'warn'
          ? 'AutoRSA — Add .env'
          : h === 'error'
            ? 'AutoRSA — Check Settings'
            : 'AutoRSA Desktop'
    const st = window.api.setWindowTitle
    if (typeof st === 'function') {
      void st(t)
    }
  }, [store, health])

  useEffect(() => {
    if (!store || !selectedGroupId) return
    if (!store.groups.some((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(store.groups[0]?.id ?? null)
    }
  }, [store, selectedGroupId])

  if (store) {
    maxLogRef.current = store.settings.maxLogChars
  }

  useEffect(() => {
    return window.api.onRsaLog((chunk) => {
      setLog((l) => trimLogEnd(l + chunk, maxLogRef.current))
    })
  }, [])

  useEffect(() => {
    setSelectedTaskId(null)
    setTaskFilter('all')
  }, [selectedGroupId])

  useEffect(() => {
    try {
      localStorage.setItem('arsa_task_density', taskDensity)
    } catch {
      /* ignore */
    }
  }, [taskDensity])

  const tasks = useMemo(() => {
    if (!store || !selectedGroupId) return [] as TaskRow[]
    return store.tasks.filter(
      (t) =>
        t.groupId === selectedGroupId &&
        (taskSearch === '' || t.name.toLowerCase().includes(taskSearch.toLowerCase()))
    )
  }, [store, selectedGroupId, taskSearch])

  const displayTasks = useMemo(() => {
    if (taskFilter === 'errors') {
      return tasks.filter((t) => Boolean(t.lastError) || t.status === 'error')
    }
    return tasks
  }, [tasks, taskFilter])

  useEffect(() => {
    if (nav !== 'tasks' || !store) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable=true]')) {
        return
      }
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        setTasksHelpOpen(true)
        return
      }
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        const ids = displayTasks.map((t) => t.id)
        if (ids.length === 0) return
        const i = selectedTaskId ? ids.indexOf(selectedTaskId) : -1
        setSelectedTaskId(ids[i < 0 ? 0 : Math.min(i + 1, ids.length - 1)]!)
        return
      }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        const ids = displayTasks.map((t) => t.id)
        if (ids.length === 0) return
        const i = selectedTaskId != null ? ids.indexOf(selectedTaskId) : 0
        setSelectedTaskId(ids[i <= 0 ? 0 : i - 1]!)
        return
      }
      if (e.key === 'Enter' && selectedTaskId && !running && canRun) {
        const row = store.tasks.find((x) => x.id === selectedTaskId)
        if (row) {
          e.preventDefault()
          void runOne(row, store.settings, updateStore, setLog, setRunning, {
            runOpts: resolveRunOpts(row, store.settings)
          })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [nav, store, displayTasks, selectedTaskId, running, canRun, updateStore])

  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-surface p-6 text-center text-sm text-red-300">
        <p className="font-medium">Failed to load saved data</p>
        <p className="max-w-md text-zinc-500">{loadError}</p>
      </div>
    )
  }

  if (!store) {
    return (
      <div className="flex h-screen items-center justify-center text-zinc-400">Loading…</div>
    )
  }

  const selectedGroup = store.groups.find((g) => g.id === selectedGroupId)
  const filteredGroups = store.groups.filter((g) =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase())
  )
  const stats = {
    total: store.tasks.length,
    running: running ? 1 : 0,
    ok: store.tasks.filter((t) => t.status === 'ok').length,
    err: store.tasks.filter((t) => t.status === 'error').length
  }
  return (
    <div className="flex h-screen overflow-hidden bg-surface text-[13px] antialiased">
      <aside className="flex w-56 shrink-0 flex-col border-r-2 border-surface-border bg-surface-raised">
        <div className="border-b-2 border-surface-border px-3 py-3">
          <div className="text-xs font-semibold tracking-wide text-zinc-500">AutoRSA Desktop</div>
          <div className="text-[11px] text-zinc-600">1.0</div>
        </div>
        <nav className="flex-1 space-y-1 p-2">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setNav(item.id)}
              className={
                'flex w-full items-center justify-between rounded-md border border-transparent px-2 py-2 text-left transition-colors duration-150 ' +
                (nav === item.id
                  ? 'border-surface-border bg-surface text-indigo-200 shadow-sm'
                  : 'text-zinc-300 hover:border-surface-border hover:bg-surface')
              }
            >
              <span>{item.label}</span>
              <span className="text-[10px] text-zinc-600">{item.kbd}</span>
            </button>
          ))}
        </nav>
        <div className="space-y-2 border-t-2 border-surface-border p-2 text-[11px]">
          <PythonStatusPill health={health} />
          <div className="font-mono text-[10px] text-zinc-600">{clock}</div>
        </div>
      </aside>

      <div className="main-view-fade flex min-h-0 min-w-0 flex-1 flex-col" key={nav}>
        {nav === 'settings' && (
          <>
            <PageHeader title={PAGE.settings.title} subtitle={PAGE.settings.subtitle} />
            <div className="min-h-0 flex-1 overflow-y-auto bg-surface">
              <div className="mx-auto w-full max-w-3xl px-4 py-4 md:px-6">
                <SettingsPanel
                  settings={store.settings}
                  onChange={(settings) => updateStore((s) => ({ ...s, settings }))}
                  pathStatus={health}
                  runStats={store.runStats}
                />
              </div>
            </div>
          </>
        )}

        {nav === 'dashboard' && (
          <>
            <PageHeader
              title={PAGE.dashboard.title}
              subtitle={PAGE.dashboard.subtitle}
              right={
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setNav('tasks')}
                    className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors duration-150 hover:bg-indigo-500"
                  >
                    Open tasks
                  </button>
                  <button
                    type="button"
                    onClick={() => setNav('settings')}
                    className="rounded-md border border-surface-border bg-zinc-800/80 px-3 py-1.5 text-xs text-zinc-200 transition-colors duration-150 hover:bg-zinc-800"
                  >
                    Settings
                  </button>
                </div>
              }
            />
            <div className="min-h-0 flex-1 overflow-y-auto bg-surface">
              <div className="mx-auto w-full max-w-7xl">
                <DashboardView
                  store={store}
                  running={running}
                  setNav={setNav}
                  onViewErrorTasks={() => {
                    setTaskFilter('errors')
                    setNav('tasks')
                  }}
                />
              </div>
            </div>
          </>
        )}

        {nav === 'tasks' && (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
            <PageHeader
              title={PAGE.tasks.title}
              subtitle={PAGE.tasks.subtitle}
              right={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {taskFilter === 'errors' && (
                    <button
                      type="button"
                      className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-200"
                      onClick={() => setTaskFilter('all')}
                    >
                      Showing errors only — clear
                    </button>
                  )}
                  <button
                    type="button"
                    title="Command history"
                    className="flex h-7 items-center justify-center rounded-md border border-surface-border bg-zinc-800 px-2 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-700"
                    onClick={() => setHistoryOpen((v) => !v)}
                  >
                    History
                  </button>
                  <button
                    type="button"
                    title="Keyboard shortcuts"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-surface-border bg-zinc-800 text-xs font-semibold text-zinc-300 hover:bg-zinc-700"
                    onClick={() => setTasksHelpOpen(true)}
                  >
                    ?
                  </button>
                </div>
              }
            />
            <div className="mx-auto flex min-h-0 w-full max-w-[1920px] flex-1">
          <section className="flex w-72 shrink-0 flex-col border-r-2 border-surface-border bg-surface-raised">
            <div className="flex items-center justify-between border-b-2 border-surface-border px-2 py-2">
              <span className="pl-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                My task groups
              </span>
              <button
                type="button"
                onClick={() => {
                  const id = newId()
                  updateStore((s) => ({
                    ...s,
                    groups: [...s.groups, { id, name: 'New group' }]
                  }))
                  setSelectedGroupId(id)
                }}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-lg leading-none text-zinc-300 hover:bg-zinc-700"
                title="Add group"
              >
                +
              </button>
            </div>
            <input
              className="mx-2 mb-2 rounded-md border border-surface-border bg-[#0c0c0e] px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600"
              placeholder="Search groups"
              value={groupSearch}
              onChange={(e) => setGroupSearch(e.target.value)}
            />
            {selectedGroupId && (
              <div className="px-2 pb-2">
                <div className="text-[10px] uppercase text-zinc-600">Group name</div>
                <input
                  className="mt-0.5 w-full rounded border border-surface-border bg-[#0c0c0e] px-2 py-1 text-xs"
                  value={store.groups.find((g) => g.id === selectedGroupId)?.name ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    updateStore((s) => ({
                      ...s,
                      groups: s.groups.map((g) =>
                        g.id === selectedGroupId ? { ...g, name: v } : g
                      )
                    }))
                  }}
                />
                {store.groups.length > 1 && (
                  <button
                    type="button"
                    className="mt-2 w-full rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300 hover:bg-red-500/20 disabled:opacity-40"
                    disabled={running}
                    onClick={() => {
                      const gid = selectedGroupId
                      const g = store.groups.find((x) => x.id === gid)
                      const other = store.groups.find((x) => x.id !== gid)
                      if (!g || !other) return
                      const n = store.tasks.filter((t) => t.groupId === gid).length
                      if (
                        !confirm(
                          `Delete group "${g.name}"? ${n} task(s) will move to "${other.name}".`
                        )
                      ) {
                        return
                      }
                      updateStore((s) => ({
                        ...s,
                        groups: s.groups.filter((x) => x.id !== gid),
                        tasks: s.tasks.map((t) =>
                          t.groupId === gid ? { ...t, groupId: other.id } : t
                        )
                      }))
                      setSelectedGroupId(other.id)
                    }}
                  >
                    Delete group
                  </button>
                )}
              </div>
            )}
            <ul className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
              {filteredGroups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedGroupId(g.id)}
                    className={
                      'mb-0.5 flex w-full items-center justify-between rounded-md px-2 py-2 text-left ' +
                      (g.id === selectedGroupId
                        ? 'bg-accent text-white'
                        : 'text-zinc-300 hover:bg-white/5')
                    }
                  >
                    <span className="truncate">{g.name}</span>
                    <span className="shrink-0 text-[11px] opacity-80">
                      {store.tasks.filter((t) => t.groupId === g.id).length}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex min-w-0 flex-1 flex-col border-l border-surface-border bg-surface">
            <div className="flex flex-wrap items-center gap-2 border-b-2 border-surface-border bg-surface-raised/50 px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  if (!selectedGroupId) return
                  updateStore((s) => ({
                    ...s,
                    tasks: [...s.tasks, { ...defaultTask(selectedGroupId), name: 'New task' }]
                  }))
                }}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
              >
                + Create task
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedGroupId) return
                  const t = { ...defaultTask(selectedGroupId), name: 'holdings-safe', mode: 'holdings', dry: true }
                  updateStore((s) => ({ ...s, tasks: [...s.tasks, t] }))
                }}
                className="rounded-md border border-surface-border bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-200 hover:bg-zinc-700"
              >
                + holdings-safe
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedGroupId) return
                  const t = {
                    ...defaultTask(selectedGroupId),
                    name: 'buy-small-dry',
                    mode: 'buy' as const,
                    amount: 1,
                    tickers: 'aapl',
                    dry: true
                  }
                  updateStore((s) => ({ ...s, tasks: [...s.tasks, t] }))
                }}
                className="rounded-md border border-surface-border bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-200 hover:bg-zinc-700"
              >
                + buy-small-dry
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedGroupId) return
                  const t = {
                    ...defaultTask(selectedGroupId),
                    name: 'sell-dry',
                    mode: 'sell' as const,
                    amount: 1,
                    tickers: 'aapl',
                    dry: true
                  }
                  updateStore((s) => ({ ...s, tasks: [...s.tasks, t] }))
                }}
                className="rounded-md border border-surface-border bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-200 hover:bg-zinc-700"
              >
                + sell-dry
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedGroupId) return
                  const t = {
                    ...defaultTask(selectedGroupId),
                    name: 'reverse-split-scan',
                    mode: 'holdings' as const,
                    brokers: 'day1',
                    notBrokers: 'webull,wellsfargo',
                    dry: true
                  }
                  updateStore((s) => ({ ...s, tasks: [...s.tasks, t] }))
                }}
                className="rounded-md border border-surface-border bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-200 hover:bg-zinc-700"
              >
                + reverse-split-scan
              </button>
              <button
                type="button"
                onClick={() => setStartAllModalOpen(true)}
                disabled={running || tasks.length === 0 || !canRun}
                title={
                  runBlockedReason ??
                  (running
                    ? 'A command is already running.'
                    : tasks.length === 0
                      ? 'No tasks in this group.'
                      : 'Run all tasks in this group in order')
                }
                className={
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150 ' +
                  (canRun && !running && tasks.length > 0
                    ? 'bg-accent text-white hover:bg-indigo-500 disabled:opacity-40'
                    : 'border border-surface-border bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40')
                }
              >
                Start all
              </button>
              <button
                type="button"
                onClick={() => {
                  cancelBatchRef.current = true
                  void window.api.rsaStop()
                  setRunning(false)
                }}
                disabled={!running}
                className="rounded-md border border-surface-border bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 transition-colors duration-150 hover:bg-zinc-700 disabled:opacity-40"
              >
                Stop
              </button>
              <div
                className="flex items-center gap-0.5 rounded-md border border-surface-border bg-[#0c0c0e] p-0.5"
                title="Table row height"
              >
                <button
                  type="button"
                  onClick={() => setTaskDensity('comfortable')}
                  className={
                    'rounded px-1.5 py-0.5 text-[10px] transition-colors ' +
                    (taskDensity === 'comfortable'
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300')
                  }
                >
                  Comfort
                </button>
                <button
                  type="button"
                  onClick={() => setTaskDensity('compact')}
                  className={
                    'rounded px-1.5 py-0.5 text-[10px] transition-colors ' +
                    (taskDensity === 'compact'
                      ? 'bg-zinc-700 text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-300')
                  }
                >
                  Compact
                </button>
              </div>
              <div className="ml-auto min-w-[180px] max-w-sm flex-1">
                <input
                  className="w-full rounded-md border border-surface-border bg-[#0c0c0e] px-2 py-1.5 text-xs"
                  placeholder="Search tasks in group"
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2 border-b-2 border-surface-border bg-surface px-3 py-2">
              <StatCard label="Total tasks" value={String(stats.total)} />
              <StatCard
                label="Running"
                value={String(stats.running)}
                variant={stats.running > 0 ? 'warn' : 'default'}
              />
              <StatCard label="Succeeded" value={String(stats.ok)} variant="good" />
              <StatCard
                label="Failed"
                value={String(stats.err)}
                variant={stats.err > 0 ? 'bad' : 'default'}
              />
              <StatCard
                label="Group"
                value={selectedGroup?.name ?? '—'}
                small
              />
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table
                className={
                  'w-full border-collapse text-left ' +
                  (taskDensity === 'compact' ? 'text-[11px]' : 'text-xs')
                }
              >
                <thead className="sticky top-0 bg-surface-raised/90 backdrop-blur">
                  <tr className="text-zinc-500">
                    <th
                      className={
                        'w-8 px-2 ' + (taskDensity === 'compact' ? 'py-1' : 'py-2')
                      }
                    />
                    <th className={'px-2 ' + (taskDensity === 'compact' ? 'py-1' : 'py-2')}>
                      Name
                    </th>
                    <th className={'px-2 ' + (taskDensity === 'compact' ? 'py-1' : 'py-2')}>
                      Mode
                    </th>
                    <th className={'px-2 ' + (taskDensity === 'compact' ? 'py-1' : 'py-2')}>
                      Brokers
                    </th>
                    <th className={'px-2 ' + (taskDensity === 'compact' ? 'py-1' : 'py-2')}>
                      Dry
                    </th>
                    <th className={'px-2 ' + (taskDensity === 'compact' ? 'py-1' : 'py-2')}>
                      Status
                    </th>
                    <th
                      className={
                        'w-40 px-2 text-right ' + (taskDensity === 'compact' ? 'py-1' : 'py-2')
                      }
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayTasks.map((t) => {
                    const py = taskDensity === 'compact' ? 'py-1' : 'py-1.5'
                    const selected = t.id === selectedTaskId
                    return (
                    <tr
                      key={t.id}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedTaskId(t.id)
                        }
                      }}
                      onClick={() => setSelectedTaskId(t.id)}
                      className={
                        'cursor-pointer border-b border-surface-border/60 transition-colors duration-150 ' +
                        (selected
                          ? 'bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/30 hover:bg-indigo-500/15'
                          : 'hover:bg-white/[0.03]')
                      }
                    >
                      <td className={'px-2 ' + py} />
                      <td className={'px-2 font-medium text-zinc-200 ' + py}>{t.name}</td>
                      <td className={'px-2 capitalize text-zinc-400 ' + py}>{t.mode}</td>
                      <td
                        className={
                          'max-w-[140px] truncate px-2 font-mono text-zinc-500 ' +
                          py +
                          ' ' +
                          (taskDensity === 'compact' ? 'text-[10px]' : 'text-[11px]')
                        }
                      >
                        {t.brokers}
                        {t.notBrokers ? ` (not ${t.notBrokers})` : ''}
                      </td>
                      <td className={'px-2 text-zinc-400 ' + py}>{t.dry ? 'Yes' : 'No'}</td>
                      <td className={'px-2 ' + py}>
                        <span
                          className={
                            'inline-flex rounded px-1.5 py-0.5 text-[10px] uppercase ' +
                            (t.status === 'ok'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : t.status === 'error'
                                ? 'bg-red-500/20 text-red-300'
                                : t.status === 'running'
                                  ? 'bg-amber-500/20 text-amber-200'
                                  : 'bg-zinc-700/50 text-zinc-500')
                          }
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className={'px-2 text-right ' + py}>
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            className="rounded border border-surface-border px-1.5 py-0.5 transition-colors hover:bg-zinc-800"
                            title={
                              runBlockedReason ?? (running ? 'A command is already running.' : 'Run this task')
                            }
                            onClick={(e) => {
                              e.stopPropagation()
                              void runOne(
                                t,
                                store.settings,
                                updateStore,
                                setLog,
                                setRunning,
                                { runOpts: resolveRunOpts(t, store.settings) }
                              )
                            }}
                            disabled={running || !canRun}
                          >
                            ▶
                          </button>
                          <button
                            type="button"
                            className="rounded border border-surface-border px-1.5 py-0.5 transition-colors hover:bg-zinc-800"
                            title="Edit"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditId(t.id)
                            }}
                            disabled={running}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="rounded border border-surface-border px-1.5 py-0.5 transition-colors hover:bg-zinc-800"
                            title="Duplicate"
                            onClick={(e) => {
                              e.stopPropagation()
                              const copy: TaskRow = {
                                ...t,
                                id: newId(),
                                name: `${t.name} (copy)`,
                                status: 'idle',
                                lastError: undefined,
                                lastRun: undefined
                              }
                              updateStore((s) => ({ ...s, tasks: [...s.tasks, copy] }))
                            }}
                            disabled={running}
                          >
                            ⧉
                          </button>
                          <button
                            type="button"
                            className="rounded border border-surface-border px-1.5 py-0.5 transition-colors hover:bg-zinc-800"
                            title="Delete"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm('Delete this task?')) {
                                updateStore((s) => ({
                                  ...s,
                                  tasks: s.tasks.filter((x) => x.id !== t.id)
                                }))
                              }
                            }}
                            disabled={running}
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="h-44 shrink-0 border-t-2 border-surface-border bg-surface-raised p-2">
              <div className="mb-1 flex items-center justify-between border-b border-surface-border pb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                <span>Output</span>
                <div className="ml-2 flex flex-wrap gap-1">
                  {brokerSignals.map((b) => (
                    <span
                      key={b.broker}
                      className={
                        'rounded px-1.5 py-0.5 text-[10px] lowercase ' +
                        (b.status === 'ok'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : b.status === 'error'
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-amber-500/20 text-amber-200')
                      }
                      title={b.detail ?? ''}
                    >
                      {b.broker}:{b.status}
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="text-indigo-400 hover:text-indigo-300"
                  onClick={() => setLog('')}
                >
                  Clear
                </button>
              </div>
              <pre className="mt-1 h-[calc(100%-2.25rem)] overflow-auto rounded-sm border border-surface-border bg-[#0a0a0c] p-2 font-mono text-[11px] text-zinc-300">
                {log || 'Run a task to see output.'}
              </pre>
            </div>
            {historyOpen && (
              <div className="h-52 shrink-0 border-t-2 border-surface-border bg-surface p-2">
                <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Command history
                </div>
                <div className="h-[calc(100%-1.5rem)] overflow-auto rounded-sm border border-surface-border bg-[#0a0a0c]">
                  {store.runHistory == null || store.runHistory.length === 0 ? (
                    <p className="p-2 text-xs text-zinc-500">No runs yet.</p>
                  ) : (
                    <table className="w-full text-left text-[11px]">
                      <thead className="sticky top-0 bg-[#111114] text-zinc-500">
                        <tr>
                          <th className="px-2 py-1">When</th>
                          <th className="px-2 py-1">Task</th>
                          <th className="px-2 py-1">Result</th>
                          <th className="px-2 py-1">Cmd</th>
                        </tr>
                      </thead>
                      <tbody>
                        {store.runHistory.map((h) => (
                          <tr key={h.id} className="border-t border-surface-border/60">
                            <td className="px-2 py-1 text-zinc-400">{new Date(h.createdAt).toLocaleTimeString()}</td>
                            <td className="px-2 py-1 text-zinc-300">{h.taskName}</td>
                            <td className={'px-2 py-1 ' + (h.ok ? 'text-emerald-300' : 'text-red-300')}>
                              {h.ok ? 'ok' : 'error'} · {h.code}
                              {h.exitKind ? ` (${h.exitKind})` : ''}
                            </td>
                            <td className="px-2 py-1 font-mono text-zinc-500">{h.commandLine}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </section>
            </div>
          </div>
        )}
      </div>

      {store.onboardingComplete === false && (
        <OnboardingWizard
          settings={store.settings}
          onPickEnvDir={async () => {
            const p = await window.api.pickDirectory()
            if (p) updateStore((s) => ({ ...s, settings: { ...s.settings, envDirectory: p } }))
          }}
          onOpenProjectRoot={() => {
            if (pathsForOnboarding) void window.api.openPath(pathsForOnboarding.projectRoot)
          }}
          onDone={() => updateStore((s) => ({ ...s, onboardingComplete: true }))}
        />
      )}

      {startAllModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
          <div
            className="w-full max-w-md rounded-md border-2 border-surface-border p-5 shadow-xl"
            style={{ background: 'rgb(var(--color-surface-raised) / 1)' }}
          >
            <h2 className="text-sm font-semibold text-zinc-100">Start all — review</h2>
            <ul className="mt-3 list-disc space-y-1.5 pl-4 text-xs text-zinc-400">
              <li>Tasks in this group: {tasks.length}</li>
              <li>
                Paths:{' '}
                {canRun ? (
                  <span className="text-emerald-400">ready</span>
                ) : (
                  <span className="text-amber-300">not ready (see Settings)</span>
                )}
              </li>
              <li>
                Global dry mode: {store.settings.forceDryRun ? 'on (live orders blocked)' : 'off'}
              </li>
              <li>Live (non-dry) tasks in list: {tasks.filter((t) => !isEffectiveDry(t, store.settings)).length}</li>
              <li>
                Retries on failure:{' '}
                {store.settings.retryOnFailure.enabled
                  ? `on (max ${store.settings.retryOnFailure.maxAttempts} attempts per task)`
                  : 'off'}
              </li>
            </ul>
            <p className="mt-2 text-[11px] text-zinc-500">
              Tasks run in list order. You can still press Stop to interrupt.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-surface-border px-3 py-1.5 text-xs"
                onClick={() => setStartAllModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white"
                onClick={() => {
                  setStartAllModalOpen(false)
                  void runAll(
                    tasks,
                    store.settings,
                    updateStore,
                    setLog,
                    setRunning,
                    cancelBatchRef
                  )
                }}
              >
                Run all
              </button>
            </div>
          </div>
        </div>
      )}

      {tasksHelpOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setTasksHelpOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-md border-2 border-surface-border p-4 text-xs shadow-xl"
            style={{ background: 'rgb(var(--color-surface-raised) / 1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold text-zinc-100">Tasks shortcuts</h2>
            <p className="mt-2 text-zinc-500">
              Brokers <code className="text-indigo-300">all</code> runs every integration AutoRSA
              supports; each needs matching variables in your <code className="text-indigo-300">.env</code>
              . Use specific brokers, or <code className="text-indigo-300">all</code> plus{' '}
              <strong>Exclude brokers</strong> (e.g. <code className="text-indigo-300">webull,wellsfargo</code>
              ) to skip ones you do not use.
            </p>
            <p className="mt-2 text-zinc-500">With focus not in an input field:</p>
            <ul className="mt-2 space-y-1.5 text-zinc-300">
              <li>
                <kbd className="rounded bg-zinc-800 px-1">j</kbd> /{' '}
                <kbd className="rounded bg-zinc-800 px-1">k</kbd> — move selection down / up
              </li>
              <li>
                <kbd className="rounded bg-zinc-800 px-1">Enter</kbd> — run selected task
              </li>
              <li>
                <kbd className="rounded bg-zinc-800 px-1">?</kbd> — this help
              </li>
            </ul>
            <button
              type="button"
              className="mt-4 w-full rounded-md border border-surface-border py-1.5 text-zinc-300"
              onClick={() => setTasksHelpOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {editId && (() => {
        const tEdit = store.tasks.find((t) => t.id === editId)
        if (!tEdit) return null
        return (
          <TaskEditor
            task={tEdit}
            onClose={() => setEditId(null)}
            onSave={(t) => {
              updateStore((s) => ({
                ...s,
                tasks: s.tasks.map((x) => (x.id === t.id ? t : x))
              }))
              setEditId(null)
            }}
          />
        )
      })()}
    </div>
  )
}

function StatCard({
  label,
  value,
  small,
  variant
}: {
  label: string
  value: string
  small?: boolean
  variant?: 'default' | 'good' | 'bad' | 'warn'
}): React.JSX.Element {
  const shell =
    variant === 'good'
      ? 'border border-emerald-500/20 bg-emerald-500/5'
      : variant === 'bad'
        ? 'border border-red-500/25 bg-red-500/5'
        : variant === 'warn'
          ? 'border border-amber-500/25 bg-amber-500/5'
          : 'border-2 border-surface-border bg-surface-raised'
  return (
    <div className={'rounded-lg px-2 py-2 transition-colors duration-150 ' + shell}>
      <div className="text-[10px] uppercase text-zinc-500">{label}</div>
      <div
        className={
          small
            ? 'truncate text-sm text-zinc-200'
            : 'text-lg font-semibold tabular-nums text-zinc-100'
        }
      >
        {value}
      </div>
    </div>
  )
}

function PageHeader({
  title,
  subtitle,
  right
}: {
  title: string
  subtitle: string
  right?: React.ReactNode
}): React.JSX.Element {
  return (
    <header className="shrink-0 border-b-2 border-surface-border bg-surface-raised px-4 py-3">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold text-zinc-100">{title}</h1>
          <p className="text-[11px] text-zinc-500">{subtitle}</p>
        </div>
        {right}
      </div>
    </header>
  )
}

function PythonStatusPill({ health }: { health: PathStatus | null }): React.JSX.Element {
  const level = healthLevel(health)
  const detail =
    health == null
      ? 'Verifying working directory, .env, and auto_rsa_bot on disk.'
      : [
          `Working dir: ${health.envDirExists ? 'ok' : 'missing'}`,
          `.env: ${health.envFileExists ? 'ok' : 'missing'}`,
          `CLI: ${health.exeExists ? 'ok' : 'missing'}`,
          health.exeExists && health.botResolvedSummary ? health.botResolvedSummary : null,
          !health.exeExists && health.botSetupHint ? health.botSetupHint : null
        ]
          .filter(Boolean)
          .join(' · ')
  const label =
    level === 'loading'
      ? 'Status…'
      : level === 'ok'
        ? 'Ready'
        : level === 'warn'
          ? 'No .env'
          : 'Fix setup'
  const color =
    level === 'loading'
      ? 'border-zinc-600 bg-zinc-800/60 text-zinc-400'
      : level === 'ok'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200/90'
        : level === 'warn'
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200/90'
          : 'border-red-500/40 bg-red-500/10 text-red-200/90'
  return (
    <div
      className={'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-1 ' + color}
      title={detail}
    >
      <span
        className={
          'h-1.5 w-1.5 shrink-0 rounded-full ' +
          (level === 'loading'
            ? 'animate-pulse bg-zinc-500'
            : level === 'ok'
              ? 'bg-emerald-400'
              : level === 'warn'
                ? 'bg-amber-400'
                : 'bg-red-400')
        }
        aria-hidden
      />
      <span className="truncate text-[10px] font-medium leading-none">{label}</span>
    </div>
  )
}

function TaskEditor({
  task,
  onClose,
  onSave
}: {
  task: TaskRow
  onClose: () => void
  onSave: (t: TaskRow) => void
}): React.JSX.Element {
  const [d, setD] = useState<TaskRow>(task)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-md border-2 border-surface-border bg-surface-raised p-4 shadow-xl">
        <h2 className="mb-3 text-sm font-semibold text-zinc-200">Edit task</h2>
        <div className="space-y-2 text-xs">
          <Labeled
            label="Name"
            value={d.name}
            onChange={(v) => setD((x) => ({ ...x, name: v }))}
          />
          <label className="block text-zinc-500">
            Mode
            <select
              className="mt-0.5 w-full rounded border border-surface-border bg-[#0c0c0e] px-2 py-1.5"
              value={d.mode}
              onChange={(e) =>
                setD((x) => ({ ...x, mode: e.target.value as TaskRow['mode'] }))
              }
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
            </>
          )}
          <Labeled
            label="Brokers (comma-separated, or keywords: all, day1, most — all needs every .env broker)"
            value={d.brokers}
            onChange={(v) => setD((x) => ({ ...x, brokers: v }))}
          />
          <Labeled
            label="Exclude brokers (optional; e.g. webull,wellsfargo when using all)"
            value={d.notBrokers}
            onChange={(v) => setD((x) => ({ ...x, notBrokers: v }))}
          />
          <label className="flex items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              checked={d.dry}
              onChange={(e) => setD((x) => ({ ...x, dry: e.target.checked }))}
            />
            Dry run (no real orders)
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-md border border-surface-border px-3 py-1.5 text-xs"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white"
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

function useClock(): string {
  const [t, setT] = useState(() => new Date().toLocaleString())
  useEffect(() => {
    const id = setInterval(() => setT(new Date().toLocaleString()), 1000)
    return () => clearInterval(id)
  }, [])
  return t
}

type RunResult = 'done' | 'aborted' | 'cancelled'

function appendWithCap(
  setLog: (s: string | ((p: string) => string)) => void,
  max: number,
  add: string
): void {
  setLog((prev) => trimLogEnd(prev + add, max))
}

function uniqCsv(...vals: Array<string | undefined>): string {
  const out: string[] = []
  const seen = new Set<string>()
  for (const v of vals) {
    for (const p of (v ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)) {
      if (seen.has(p)) continue
      seen.add(p)
      out.push(p)
    }
  }
  return out.join(',')
}

function resolveRunOpts(task: TaskRow, settings: AppSettings): BuildCliOpts {
  if (!taskUsesAllBrokers(task) || !settings.brokerProfile.applyToAllKeyword) return {}
  return {
    brokerOverride: settings.brokerProfile.include.trim() || 'all',
    notBrokersOverride: uniqCsv(task.notBrokers, settings.brokerProfile.exclude)
  }
}

async function runOne(
  t: TaskRow,
  settings: AppSettings,
  updateStore: (u: (p: Store) => Store) => void,
  setLog: (s: string | ((p: string) => string)) => void,
  setRunning: (v: boolean) => void,
  opts?: { batch?: boolean; cancelRef?: { current: boolean }; runOpts?: BuildCliOpts }
): Promise<RunResult> {
  const runOpts = opts?.runOpts
  const preflight = taskRunPreflight(t, runOpts)
  if (preflight) {
    appendWithCap(
      setLog,
      settings.maxLogChars,
      `\n--- ${t.name} ---\n${preflight}\n\n— Summary: ${t.name} · skipped · not run —\n`
    )
    return 'aborted'
  }
  const argsPreview = buildCliArgs(t, settings, runOpts)
  if (
    settings.riskGuard.enabled &&
    !isEffectiveDry(t, settings) &&
    (t.mode === 'buy' || t.mode === 'sell') &&
    t.amount > settings.riskGuard.maxSharesPerOrder
  ) {
    appendWithCap(
      setLog,
      settings.maxLogChars,
      `\n--- ${t.name} ---\nBlocked by risk guard: ${t.mode} amount ${t.amount} exceeds max live shares (${settings.riskGuard.maxSharesPerOrder}).\n\n— Summary: ${t.name} · blocked · risk guard —\n`
    )
    return 'aborted'
  }
  const selectedBrokers = parseBrokerList(runOpts?.brokerOverride ?? t.brokers)
  const envSummary = await window.api.envSummary({ envDirectory: settings.envDirectory })
  const missingByBroker = missingEnvByBroker(selectedBrokers, envSummary.keys)
  const missingLines = Object.entries(missingByBroker)
    .map(([b, keys]) => `${b}: ${keys.join(', ')}`)
    .join('\n')
  const live = !isEffectiveDry(t, settings)
  const preflightLines = [
    `Task: ${t.name}`,
    `Mode: ${t.mode}`,
    `Command: ${formatCommandLine(settings.autoRsaExecutable, argsPreview)}`,
    `cwd: ${envSummary.cwd}`,
    `Brokers: ${selectedBrokers.join(', ') || '(none)'}`,
    `Run type: ${live ? 'LIVE' : 'DRY'}`,
    missingLines ? `Missing .env vars:\n${missingLines}` : 'Missing .env vars: none'
  ].join('\n')
  const needsConfirm = !opts?.batch || live || Object.keys(missingByBroker).length > 0
  if (needsConfirm) {
    const ok = confirm(
      preflightLines +
        (live
          ? '\n\nThis is a LIVE run. Confirm to continue.'
          : '\n\nConfirm to run.')
    )
    if (!ok) return 'aborted'
  }
  if (opts?.cancelRef?.current) return 'cancelled'

  const max = settings.maxLogChars
  const maxTries = settings.retryOnFailure.enabled
    ? Math.max(1, Math.min(20, settings.retryOnFailure.maxAttempts))
    : 1

  if (!opts?.batch) {
    setRunning(true)
  }
  try {
    updateStore((s) => ({
      ...s,
      tasks: s.tasks.map((x) => (x.id === t.id ? { ...x, status: 'running' as const } : x))
    }))

    const t0 = Date.now()
    let lastRes: RsaRunResult | null = null

    for (let attempt = 1; attempt <= maxTries; attempt++) {
      if (opts?.cancelRef?.current) return 'cancelled'

      const args = buildCliArgs(t, settings, runOpts)
      if (attempt === 1) {
        appendWithCap(
          setLog,
          max,
          `\n--- ${t.name} ---\n$ ${formatCommandLine(settings.autoRsaExecutable, args)}\n`
        )
        if ((runOpts?.notBrokersOverride ?? '').trim().length > 0) {
          appendWithCap(setLog, max, `Skipped brokers: ${(runOpts?.notBrokersOverride ?? '').trim()}\n`)
        }
      } else {
        appendWithCap(setLog, max, `\n— Retry ${attempt}/${maxTries} —\n`)
      }

      const toSec = settings.commandTimeoutSec
      const res = await window.api.rsaRun({
        args,
        cwd: settings.envDirectory,
        autoRsaExecutable: settings.autoRsaExecutable,
        timeoutMs: toSec > 0 ? toSec * 1000 : undefined
      })
      lastRes = res

      if (res.error) {
        appendWithCap(setLog, max, res.error + '\n')
      }

      if (res.ok) break
      if (!settings.retryOnFailure.enabled) break
      if (attempt >= maxTries) break
      if (res.exitKind === 'user_stopped' || res.exitKind === 'timeout') break
    }

    const res = lastRes!
    const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1)
    const summaryLine = `— Summary: ${t.name} · ${res.ok ? 'ok' : 'error'} · exit ${res.code} · ${elapsedSec}s${
      maxTries > 1 ? ` · up to ${maxTries} attempts` : ''
    } —`
    appendWithCap(setLog, max, `\n${summaryLine}\n`)
    if (res.exitKind && res.exitKind !== 'normal') {
      appendWithCap(setLog, max, `(exit kind: ${res.exitKind})\n`)
    }

    const errLine =
      res.error ??
      (!res.ok
        ? res.exitKind === 'user_stopped'
          ? 'Stopped'
          : `exit ${res.code}`
        : undefined)

    updateStore((s) => ({
      ...s,
      tasks: s.tasks.map((x) =>
        x.id === t.id
          ? {
              ...x,
              status: res.ok ? 'ok' : 'error',
              lastError: errLine,
              lastRun: new Date().toISOString()
            }
          : x
      ),
      runStats: s.settings.telemetryLocalEnabled
        ? {
            ok: s.runStats.ok + (res.ok ? 1 : 0),
            err: s.runStats.err + (res.ok ? 0 : 1)
          }
        : s.runStats,
      runHistory: [
        {
          id: crypto.randomUUID(),
          taskId: t.id,
          taskName: t.name,
          mode: t.mode,
          commandLine: formatCommandLine(settings.autoRsaExecutable, argsPreview),
          cwd: envSummary.cwd,
          ok: res.ok,
          code: res.code,
          exitKind: res.exitKind,
          elapsedSec: Number(elapsedSec),
          createdAt: new Date().toISOString()
        },
        ...(s.runHistory ?? [])
      ].slice(0, 50)
    }))
  } finally {
    if (!opts?.batch) {
      setRunning(false)
    }
  }
  return 'done'
}

async function runAll(
  list: TaskRow[],
  settings: AppSettings,
  updateStore: (u: (p: Store) => Store) => void,
  setLog: (s: string | ((p: string) => string)) => void,
  setRunning: (v: boolean) => void,
  cancelRef: { current: boolean }
): Promise<void> {
  if (list.length === 0) return
  const hasLive = list.some((t) => !isEffectiveDry(t, settings))
  if (hasLive) {
    const ok = confirm('Some tasks are not dry runs (and global dry mode is off). Continue for ALL tasks?')
    if (!ok) return
  }
  cancelRef.current = false
  setRunning(true)
  try {
    for (const t of list) {
      if (cancelRef.current) {
        break
      }
      const r = await runOne(t, settings, updateStore, setLog, setRunning, {
        batch: true,
        cancelRef,
        runOpts: resolveRunOpts(t, settings)
      })
      if (r === 'aborted' || r === 'cancelled') {
        break
      }
    }
  } finally {
    setRunning(false)
    cancelRef.current = false
  }
}

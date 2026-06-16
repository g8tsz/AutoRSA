import { useCallback, useEffect, useRef, useState } from 'react'
import { ConfirmProvider } from './context/ConfirmContext'
import { DashboardView } from './Dashboard'
import { healthLevel, useEnvironmentHealth } from './hooks/useEnvironmentHealth'
import { useNavShortcuts } from './hooks/useNavShortcuts'
import { useTheme } from './hooks/useTheme'
import { OnboardingWizard } from './OnboardingWizard'
import { SettingsPanel } from './SettingsPanel'
import { ScheduledJobsPanel } from './components/ScheduledJobsPanel'
import type { Store } from './types'
import { TasksView } from './views/TasksView'

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

export default function App(): React.JSX.Element {
  const [store, setStore] = useState<Store | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [nav, setNav] = useState<NavId>('tasks')
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [taskFilter, setTaskFilter] = useState<'all' | 'errors'>('all')
  const [pathsForOnboarding, setPathsForOnboarding] = useState<{ userData: string; projectRoot: string } | null>(
    null
  )
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const health = useEnvironmentHealth(store?.settings ?? null)
  useTheme(store?.settings.theme ?? 'dark')
  useNavShortcuts(setNav)

  const flushSave = useCallback((s: Store) => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void window.api.storeSave(s).then((r) => {
        if (r && typeof r === 'object' && 'ok' in r && !r.ok) {
          setSaveError(String((r as { error?: string }).error ?? 'Save failed'))
        } else {
          setSaveError(null)
        }
      })
    }, 200)
  }, [])

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
        const s = raw as Store
        let g = s.groups
        let t = s.tasks
        if (g.length === 0) {
          const id = newId()
          g = [{ id, name: 'Default', sortOrder: 0 }]
          t = [
            {
              id: newId(),
              groupId: id,
              name: 'New task',
              mode: 'holdings',
              amount: 0,
              tickers: '',
              brokers: 'all',
              notBrokers: '',
              dry: true,
              status: 'idle',
              sortOrder: 0
            }
          ]
          const next = { ...s, groups: g, tasks: t }
          void window.api.storeSave(next)
          setStore(next)
          setSelectedGroupId(g[0]!.id)
          return
        }
        setStore(s)
        setSelectedGroupId(g[0]!.id)
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : String(e)))
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
    void window.api.setWindowTitle(t)
  }, [store, health])

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center text-red-300">
        Failed to load: {loadError}
      </div>
    )
  }
  if (!store) {
    return <div className="flex h-screen items-center justify-center text-zinc-400">Loading…</div>
  }

  return (
    <ConfirmProvider>
      <div className="flex h-screen overflow-hidden bg-surface text-[13px] antialiased">
        <aside className="flex w-56 shrink-0 flex-col border-r-2 border-surface-border bg-surface-raised">
          <div className="border-b-2 border-surface-border px-3 py-3">
            <div className="text-xs font-semibold text-zinc-500">AutoRSA Desktop</div>
            <div className="text-[11px] text-zinc-600">1.1</div>
          </div>
          <nav className="flex-1 space-y-1 p-2">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setNav(item.id)}
                className={
                  'flex w-full items-center justify-between rounded-md px-2 py-2 text-left ' +
                  (nav === item.id ? 'border border-surface-border bg-surface text-indigo-200' : 'text-zinc-300 hover:bg-surface')
                }
              >
                <span>{item.label}</span>
                <span className="text-[10px] text-zinc-600">{item.kbd}</span>
              </button>
            ))}
          </nav>
          <PythonStatusPill health={health} />
          {saveError && <p className="px-2 pb-2 text-[10px] text-red-300">{saveError}</p>}
        </aside>

        <div className="main-view-fade flex min-h-0 min-w-0 flex-1 flex-col" key={nav}>
          <PageHeader title={PAGE[nav].title} subtitle={PAGE[nav].subtitle} />

          {nav === 'settings' && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mx-auto max-w-3xl space-y-4">
                <SettingsPanel
                  settings={store.settings}
                  onChange={(settings) => updateStore((s) => ({ ...s, settings }))}
                  pathStatus={health}
                  runStats={store.runStats}
                />
                <ScheduledJobsPanel
                  store={store}
                  onChange={updateStore}
                  selectedGroupId={selectedGroupId}
                />
              </div>
            </div>
          )}

          {nav === 'dashboard' && (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <DashboardView
                store={store}
                running={false}
                setNav={setNav}
                onViewErrorTasks={() => {
                  setTaskFilter('errors')
                  setNav('tasks')
                }}
              />
            </div>
          )}

          {nav === 'tasks' && (
            <TasksView
              store={store}
              updateStore={updateStore}
              health={health}
              selectedGroupId={selectedGroupId}
              setSelectedGroupId={setSelectedGroupId}
              taskFilter={taskFilter}
              setTaskFilter={setTaskFilter}
              onViewErrors={() => setTaskFilter('errors')}
            />
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
      </div>
    </ConfirmProvider>
  )
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }): React.JSX.Element {
  return (
    <header className="shrink-0 border-b-2 border-surface-border bg-surface-raised px-4 py-3">
      <h1 className="text-base font-semibold text-zinc-100">{title}</h1>
      <p className="text-[11px] text-zinc-500">{subtitle}</p>
    </header>
  )
}

function PythonStatusPill({ health }: { health: ReturnType<typeof useEnvironmentHealth> }): React.JSX.Element {
  const level = healthLevel(health)
  const label =
    level === 'loading' ? 'Status…' : level === 'ok' ? 'Ready' : level === 'warn' ? 'No .env' : 'Fix setup'
  const color =
    level === 'ok'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
      : level === 'warn'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
        : 'border-red-500/40 bg-red-500/10 text-red-200'
  return (
    <div className={'mx-2 mb-2 rounded-full border px-2 py-1 text-[10px] ' + color}>
      {label}
    </div>
  )
}

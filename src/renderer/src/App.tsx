import { useCallback, useEffect, useRef, useState } from 'react'
import { buildCliArgs, formatCommandLine } from './lib/buildArgs'
import { trimLogEnd } from './lib/log'
import type { AppSettings, Store, TaskGroup, TaskRow } from './types'

function newId(): string {
  return crypto.randomUUID()
}

const NAV = [
  { id: 'dashboard', label: 'Dashboard', kbd: 'Alt+D' },
  { id: 'tasks', label: 'Tasks', kbd: 'Alt+T' },
  { id: 'settings', label: 'Settings', kbd: 'Alt+S' }
] as const

type NavId = (typeof NAV)[number]['id']

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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxLogRef = useRef(400_000)
  const cancelBatchRef = useRef(false)

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
      .then((s) => {
        let g = s.groups
        let t = s.tasks
        if (g.length === 0) {
          const id = newId()
          g = [defaultGroup(id)]
          t = [defaultTask(id)]
          s = { ...s, groups: g, tasks: t }
          void window.api.storeSave(s)
        }
        setStore(s)
        setSelectedGroupId(g[0]!.id)
      })
      .catch((e) => {
        setLoadError(e instanceof Error ? e.message : String(e))
      })
  }, [])

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

  const clock = useClock()

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
  const tasks = store.tasks.filter(
    (t) =>
      t.groupId === selectedGroupId &&
      (taskSearch === '' || t.name.toLowerCase().includes(taskSearch.toLowerCase()))
  )

  const stats = {
    total: store.tasks.length,
    running: running ? 1 : 0,
    ok: store.tasks.filter((t) => t.status === 'ok').length,
    err: store.tasks.filter((t) => t.status === 'error').length
  }

  return (
    <div className="flex h-screen overflow-hidden text-[13px]">
      <aside className="flex w-56 shrink-0 flex-col border-r border-surface-border bg-[#0c0c0e]">
        <div className="border-b border-surface-border px-3 py-3">
          <div className="text-xs font-semibold tracking-wide text-zinc-500">AutoRSA Desktop</div>
          <div className="text-[11px] text-zinc-600">1.0</div>
        </div>
        <nav className="flex-1 space-y-0.5 p-2">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setNav(item.id)}
              className={
                'flex w-full items-center justify-between rounded-lg px-2 py-2 text-left ' +
                (nav === item.id
                  ? 'bg-accent/15 text-indigo-200'
                  : 'text-zinc-300 hover:bg-white/5')
              }
            >
              <span>{item.label}</span>
              <span className="text-[10px] text-zinc-600">{item.kbd}</span>
            </button>
          ))}
        </nav>
        <div className="space-y-2 border-t border-surface-border p-2 text-[11px] text-zinc-500">
          <div>Python: check Settings</div>
          <div className="font-mono text-[10px] text-zinc-600">{clock}</div>
        </div>
      </aside>

      {nav === 'settings' && (
        <SettingsPanel
          settings={store.settings}
          onChange={(settings) => updateStore((s) => ({ ...s, settings }))}
        />
      )}

      {nav === 'dashboard' && (
        <div className="flex flex-1 flex-col items-center justify-center bg-surface p-8 text-zinc-400">
          <h1 className="mb-2 text-lg font-medium text-zinc-200">AutoRSA</h1>
          <p className="max-w-md text-center text-sm">
            Use Tasks to run buy, sell, or holdings commands against your configured brokerages.
            Configure your <code className="text-indigo-300">.env</code> in Settings and install
            the Python venv (see <code className="text-indigo-300">python/setup.ps1</code>).
          </p>
        </div>
      )}

      {nav === 'tasks' && (
        <>
          <section className="flex w-72 shrink-0 flex-col border-r border-surface-border bg-surface-raised/40">
            <div className="flex items-center justify-between border-b border-surface-border px-2 py-2">
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

          <section className="flex min-w-0 flex-1 flex-col bg-surface">
            <div className="flex flex-wrap items-center gap-2 border-b border-surface-border px-3 py-2">
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
                onClick={() =>
                  void runAll(
                    tasks,
                    store.settings,
                    updateStore,
                    setLog,
                    setRunning,
                    cancelBatchRef
                  )
                }
                disabled={running || tasks.length === 0}
                className="rounded-md border border-surface-border bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
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
                className="rounded-md border border-surface-border bg-zinc-800 px-2 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 disabled:opacity-40"
              >
                Stop
              </button>
              <div className="ml-auto min-w-[180px] max-w-sm flex-1">
                <input
                  className="w-full rounded-md border border-surface-border bg-[#0c0c0e] px-2 py-1.5 text-xs"
                  placeholder="Search tasks in group"
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2 border-b border-surface-border px-3 py-2">
              <StatCard label="Total tasks" value={String(stats.total)} />
              <StatCard label="Running" value={String(stats.running)} />
              <StatCard label="Succeeded" value={String(stats.ok)} />
              <StatCard label="Failed" value={String(stats.err)} />
              <StatCard
                label="Group"
                value={selectedGroup?.name ?? '—'}
                small
              />
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-surface-raised/90 backdrop-blur">
                  <tr className="text-zinc-500">
                    <th className="w-8 px-2 py-2" />
                    <th className="px-2 py-2">Name</th>
                    <th className="px-2 py-2">Mode</th>
                    <th className="px-2 py-2">Brokers</th>
                    <th className="px-2 py-2">Dry</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="w-40 px-2 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-surface-border/60 hover:bg-white/[0.02]"
                    >
                      <td className="px-2 py-1.5" />
                      <td className="px-2 py-1.5 font-medium text-zinc-200">{t.name}</td>
                      <td className="px-2 py-1.5 capitalize text-zinc-400">{t.mode}</td>
                      <td className="max-w-[140px] truncate px-2 py-1.5 font-mono text-[11px] text-zinc-500">
                        {t.brokers}
                        {t.notBrokers ? ` (not ${t.notBrokers})` : ''}
                      </td>
                      <td className="px-2 py-1.5 text-zinc-400">{t.dry ? 'Yes' : 'No'}</td>
                      <td className="px-2 py-1.5">
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
                      <td className="px-2 py-1.5 text-right">
                        <div className="inline-flex gap-1">
                          <button
                            type="button"
                            className="rounded border border-surface-border px-1.5 py-0.5 hover:bg-zinc-800"
                            title="Run"
                            onClick={() =>
                              void runOne(
                                t,
                                store.settings,
                                updateStore,
                                setLog,
                                setRunning
                              )
                            }
                            disabled={running}
                          >
                            ▶
                          </button>
                          <button
                            type="button"
                            className="rounded border border-surface-border px-1.5 py-0.5 hover:bg-zinc-800"
                            title="Edit"
                            onClick={() => setEditId(t.id)}
                            disabled={running}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className="rounded border border-surface-border px-1.5 py-0.5 hover:bg-zinc-800"
                            title="Duplicate"
                            onClick={() => {
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
                            className="rounded border border-surface-border px-1.5 py-0.5 hover:bg-zinc-800"
                            title="Delete"
                            onClick={() => {
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
                  ))}
                </tbody>
              </table>
            </div>

            <div className="h-40 shrink-0 border-t border-surface-border bg-[#0a0a0c] p-2">
              <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
                <span>Output</span>
                <button
                  type="button"
                  className="text-indigo-400 hover:text-indigo-300"
                  onClick={() => setLog('')}
                >
                  Clear
                </button>
              </div>
              <pre className="h-[calc(100%-1.5rem)] overflow-auto font-mono text-[11px] text-zinc-300">
                {log || 'Run a task to see output.'}
              </pre>
            </div>
          </section>
        </>
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
  small
}: {
  label: string
  value: string
  small?: boolean
}): React.JSX.Element {
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised/80 px-2 py-2">
      <div className="text-[10px] uppercase text-zinc-500">{label}</div>
      <div className={small ? 'truncate text-sm text-zinc-200' : 'text-lg font-semibold text-zinc-100'}>
        {value}
      </div>
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
      <div className="w-full max-w-md rounded-xl border border-surface-border bg-[#12121a] p-4 shadow-xl">
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
            label="Brokers (e.g. all, day1, robinhood,schwab)"
            value={d.brokers}
            onChange={(v) => setD((x) => ({ ...x, brokers: v }))}
          />
          <Labeled
            label="Exclude brokers (optional, comma)"
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

function SettingsPanel({
  settings,
  onChange
}: {
  settings: AppSettings
  onChange: (s: AppSettings) => void
}): React.JSX.Element {
  const [paths, setPaths] = useState<{ userData: string; projectRoot: string } | null>(null)
  useEffect(() => {
    void window.api.getPaths().then(setPaths)
  }, [])
  return (
    <div className="flex-1 space-y-4 overflow-y-auto bg-surface p-6 text-sm text-zinc-300">
      <h1 className="text-base font-semibold text-zinc-100">Settings</h1>
      <p className="max-w-2xl text-xs text-zinc-500">
        AutoRSA reads broker credentials from a <code className="text-indigo-300">.env</code> file in
        the <strong>working directory</strong> you set below. Put broker cookies in a{' '}
        <code className="text-indigo-300">creds</code> folder next to that <code>.env</code> if the
        upstream project expects it — see the{' '}
        <button
          type="button"
          className="text-indigo-400 underline hover:text-indigo-300"
          onClick={() => void window.api.openExternal('https://github.com/NelsonDane/auto-rsa')}
        >
          AutoRSA README
        </button>
        . Python 3.12+ is required for <code>auto_rsa_bot</code>.
      </p>
      <p className="max-w-2xl text-xs text-amber-200/80">
        This app spawns the CLI with <code className="text-amber-100">DANGER_MODE=true</code> so the
        Python process does not wait for a second terminal confirmation. Rely on <strong>dry run</strong>{' '}
        and the confirmation dialogs here before live orders.
      </p>
      <div>
        <div className="text-xs text-zinc-500">.env directory (working directory for CLI)</div>
        <div className="mt-1 flex gap-2">
          <input
            readOnly
            className="min-w-0 flex-1 rounded border border-surface-border bg-[#0c0c0e] px-2 py-1.5 font-mono text-xs"
            value={settings.envDirectory}
          />
          <button
            type="button"
            className="shrink-0 rounded-md border border-surface-border bg-zinc-800 px-2 py-1 text-xs"
            onClick={async () => {
              const p = await window.api.pickDirectory()
              if (p) onChange({ ...settings, envDirectory: p })
            }}
          >
            Browse
          </button>
          <button
            type="button"
            className="shrink-0 rounded-md border border-surface-border bg-zinc-800 px-2 py-1 text-xs"
            onClick={() => void window.api.openPath(settings.envDirectory)}
          >
            Open
          </button>
        </div>
      </div>
      <div>
        <div className="text-xs text-zinc-500">auto_rsa_bot executable</div>
        <div className="mt-1 flex gap-2">
          <input
            readOnly
            className="min-w-0 flex-1 rounded border border-surface-border bg-[#0c0c0e] px-2 py-1.5 font-mono text-xs"
            value={settings.autoRsaExecutable}
          />
          <button
            type="button"
            className="shrink-0 rounded-md border border-surface-border bg-zinc-800 px-2 py-1 text-xs"
            onClick={async () => {
              const p = await window.api.pickExecutable()
              if (p) onChange({ ...settings, autoRsaExecutable: p })
            }}
          >
            Browse
          </button>
        </div>
      </div>
      <div className="max-w-md">
        <div className="text-xs text-zinc-500">Max log size (characters)</div>
        <input
          type="number"
          min={5_000}
          step={1_000}
          className="mt-0.5 w-full rounded border border-surface-border bg-[#0c0c0e] px-2 py-1.5 font-mono text-xs"
          value={settings.maxLogChars}
          onChange={(e) => {
            const n = Math.max(5_000, Math.floor(Number(e.target.value) || 0))
            onChange({ ...settings, maxLogChars: n })
          }}
        />
        <p className="mt-0.5 text-[11px] text-zinc-600">Older output is dropped from the top when full.</p>
      </div>
      <div className="max-w-md">
        <div className="text-xs text-zinc-500">Command timeout (seconds, 0 = off)</div>
        <input
          type="number"
          min={0}
          step={30}
          className="mt-0.5 w-full rounded border border-surface-border bg-[#0c0c0e] px-2 py-1.5 font-mono text-xs"
          value={settings.commandTimeoutSec}
          onChange={(e) => {
            const n = Math.max(0, Math.floor(Number(e.target.value) || 0))
            onChange({ ...settings, commandTimeoutSec: n })
          }}
        />
        <p className="mt-0.5 text-[11px] text-zinc-600">
          Kills a stuck <code>auto_rsa_bot</code> after this time. Use 0 to disable, or 3600+ for
          long broker flows.
        </p>
      </div>
      {paths && (
        <div className="text-[11px] text-zinc-600">
          <div>User data: {paths.userData}</div>
          <div>App root: {paths.projectRoot}</div>
        </div>
      )}
    </div>
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

async function runOne(
  t: TaskRow,
  settings: AppSettings,
  updateStore: (u: (p: Store) => Store) => void,
  setLog: (s: string | ((p: string) => string)) => void,
  setRunning: (v: boolean) => void,
  opts?: { batch?: boolean; cancelRef?: { current: boolean } }
): Promise<RunResult> {
  if (!t.dry && !opts?.batch) {
    const ok = confirm('This task is NOT a dry run. Real orders may be sent. Continue?')
    if (!ok) return 'aborted'
  }
  if (opts?.cancelRef?.current) return 'cancelled'

  const max = settings.maxLogChars
  const args = buildCliArgs(t)
  appendWithCap(
    setLog,
    max,
    `\n--- ${t.name} ---\n$ ${formatCommandLine(settings.autoRsaExecutable, args)}\n`
  )
  if (!opts?.batch) {
    setRunning(true)
  }
  try {
    updateStore((s) => ({
      ...s,
      tasks: s.tasks.map((x) => (x.id === t.id ? { ...x, status: 'running' as const } : x))
    }))

    const toSec = settings.commandTimeoutSec
    const res = await window.api.rsaRun({
      args,
      cwd: settings.envDirectory,
      autoRsaExecutable: settings.autoRsaExecutable,
      timeoutMs: toSec > 0 ? toSec * 1000 : undefined
    })

    updateStore((s) => ({
      ...s,
      tasks: s.tasks.map((x) =>
        x.id === t.id
          ? {
              ...x,
              status: res.ok ? 'ok' : 'error',
              lastError: res.error ?? (res.ok ? undefined : `exit ${res.code}`),
              lastRun: new Date().toISOString()
            }
          : x
      )
    }))
    if (res.error) {
      appendWithCap(setLog, max, res.error + '\n')
    }
    appendWithCap(setLog, max, `\n(exit code ${res.code})\n`)
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
  const hasLive = list.some((t) => !t.dry)
  if (hasLive) {
    const ok = confirm('Some tasks are not dry runs. Continue for ALL tasks?')
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
        cancelRef
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

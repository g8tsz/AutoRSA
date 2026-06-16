import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BatchProgressBar } from '../components/BatchProgressBar'
import { HoldingsComparePanel } from '../components/HoldingsComparePanel'
import { OutputPanel } from '../components/OutputPanel'
import { TaskEditor } from '../components/TaskEditor'
import { useConfirm } from '../context/ConfirmContext'
import { healthLevel, isReadyToRun, type PathStatus } from '../hooks/useEnvironmentHealth'
import { isEffectiveDry } from '../lib/buildArgs'
import { taskUsesAllBrokers } from '../lib/brokers'
import { downloadJson, exportStoreSubset, importBundle, type ExportBundle } from '../lib/importExport'
import {
  moveTask,
  resolveRunOpts,
  runBatch,
  runOne,
  sortTasksInGroup,
  type RunProgress
} from '../lib/runOrchestration'
import { RunBrokerPicker } from '../RunBrokerPicker'
import type { AppSettings, CommandHistoryEntry, Store, TaskGroup, TaskRow, TaskTemplate } from '../types'

function newId(): string {
  return crypto.randomUUID()
}

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
  status: 'idle',
  sortOrder: Date.now()
})

const QUICK_TEMPLATES: Array<{ label: string; task: Partial<TaskRow> }> = [
  { label: 'holdings-safe', task: { name: 'holdings-safe', mode: 'holdings', dry: true } },
  {
    label: 'buy-small-dry',
    task: { name: 'buy-small-dry', mode: 'buy', amount: 1, tickers: 'aapl', dry: true }
  },
  { label: 'sell-dry', task: { name: 'sell-dry', mode: 'sell', amount: 1, tickers: 'aapl', dry: true } },
  {
    label: 'reverse-split-scan',
    task: {
      name: 'reverse-split-scan',
      mode: 'holdings',
      brokers: 'day1',
      notBrokers: 'webull,wellsfargo',
      dry: true
    }
  }
]

type Props = {
  store: Store
  updateStore: (u: (p: Store) => Store) => void
  health: PathStatus | null
  selectedGroupId: string | null
  setSelectedGroupId: (id: string) => void
  onViewErrors: () => void
  taskFilter: 'all' | 'errors'
  setTaskFilter: (f: 'all' | 'errors') => void
}

export function TasksView({
  store,
  updateStore,
  health,
  selectedGroupId,
  setSelectedGroupId,
  taskFilter,
  setTaskFilter
}: Props): React.JSX.Element {
  const confirm = useConfirm()
  const canRun = isReadyToRun(health)
  const [groupSearch, setGroupSearch] = useState('')
  const [taskSearch, setTaskSearch] = useState('')
  const [log, setLog] = useState('')
  const logRef = useRef('')
  logRef.current = log
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
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [startAllModalOpen, setStartAllModalOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [tasksHelpOpen, setTasksHelpOpen] = useState(false)
  const [brokerPickerTask, setBrokerPickerTask] = useState<TaskRow | null>(null)
  const [batchProgress, setBatchProgress] = useState<RunProgress | null>(null)
  const [outputHeight, setOutputHeight] = useState(176)
  const [outputCollapsed, setOutputCollapsed] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const cancelBatchRef = useRef(false)

  const runCallbacks = useMemo(
    () => ({
      confirm,
      updateStore,
      setLog,
      setRunning,
      onProgress: setBatchProgress,
      getLog: () => logRef.current
    }),
    [confirm, updateStore]
  )

  useEffect(() => {
    return window.api.onRsaLog((chunk) => {
      setLog((l) => {
        const max = store.settings.maxLogChars
        const next = l + chunk
        return next.length > max ? next.slice(next.length - max) : next
      })
    })
  }, [store.settings.maxLogChars])

  useEffect(() => {
    try {
      localStorage.setItem('arsa_task_density', taskDensity)
    } catch {
      /* ignore */
    }
  }, [taskDensity])

  useEffect(() => {
    const unsub = window.api.onScheduleDue?.((jobId: string) => {
      const job = store.scheduledJobs?.find((j) => j.id === jobId)
      if (!job || !selectedGroupId) return
      const list = sortTasksInGroup(store.tasks, job.groupId)
      void runBatch(list, store.settings, runCallbacks, cancelBatchRef, (t) => resolveRunOpts(t, store.settings))
      updateStore((s) => ({
        ...s,
        scheduledJobs: (s.scheduledJobs ?? []).map((j) =>
          j.id === jobId ? { ...j, lastRunAt: new Date().toISOString() } : j
        )
      }))
    })
    return unsub
  }, [store, selectedGroupId, runCallbacks, updateStore])

  const rootGroups = useMemo(
    () => store.groups.filter((g) => !g.parentId).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [store.groups]
  )

  const childGroups = useCallback(
    (parentId: string) =>
      store.groups
        .filter((g) => g.parentId === parentId)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [store.groups]
  )

  const filteredGroups = rootGroups.filter((g) =>
    g.name.toLowerCase().includes(groupSearch.toLowerCase())
  )

  const tasks = useMemo(() => {
    if (!selectedGroupId) return [] as TaskRow[]
    return sortTasksInGroup(store.tasks, selectedGroupId).filter(
      (t) => taskSearch === '' || t.name.toLowerCase().includes(taskSearch.toLowerCase())
    )
  }, [store.tasks, selectedGroupId, taskSearch])

  const displayTasks = useMemo(() => {
    if (taskFilter === 'errors') {
      return tasks.filter((t) => Boolean(t.lastError) || t.status === 'error')
    }
    return tasks
  }, [tasks, taskFilter])

  const runBlockedReason =
    health == null
      ? 'Checking paths…'
      : !canRun
        ? 'Fix Settings paths first.'
        : null

  const executeRun = useCallback(
    (t: TaskRow, brokerOverride?: string) => {
      const runOpts = brokerOverride
        ? { brokerOverride, notBrokersOverride: t.notBrokers }
        : resolveRunOpts(t, store.settings)
      void runOne(t, store.settings, runCallbacks, { runOpts })
    },
    [store.settings, runCallbacks]
  )

  const handleRunClick = useCallback(
    (t: TaskRow) => {
      if (taskUsesAllBrokers(t)) {
        setBrokerPickerTask(t)
        return
      }
      executeRun(t)
    },
    [executeRun]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable=true]')) return
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        e.preventDefault()
        setTasksHelpOpen(true)
        return
      }
      const ids = displayTasks.map((t) => t.id)
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        if (ids.length === 0) return
        const i = selectedTaskId ? ids.indexOf(selectedTaskId) : -1
        setSelectedTaskId(ids[i < 0 ? 0 : Math.min(i + 1, ids.length - 1)]!)
        return
      }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        if (ids.length === 0) return
        const i = selectedTaskId != null ? ids.indexOf(selectedTaskId) : 0
        setSelectedTaskId(ids[i <= 0 ? 0 : i - 1]!)
        return
      }
      if (e.key === 'Enter' && selectedTaskId && !running && canRun) {
        const row = store.tasks.find((x) => x.id === selectedTaskId)
        if (row) {
          e.preventDefault()
          handleRunClick(row)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [displayTasks, selectedTaskId, running, canRun, store.tasks, handleRunClick])

  const toggleSelect = (id: string) => {
    setSelectedTaskIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const selectedGroup = store.groups.find((g) => g.id === selectedGroupId)
  const stats = {
    total: store.tasks.length,
    running: running ? 1 : 0,
    ok: store.tasks.filter((t) => t.status === 'ok').length,
    err: store.tasks.filter((t) => t.status === 'error').length
  }

  const rerunFromHistory = (h: CommandHistoryEntry) => {
    const t = store.tasks.find((x) => x.id === h.taskId)
    if (t) handleRunClick(t)
  }

  const handleImport = async (file: File) => {
    const text = await file.text()
    const bundle = JSON.parse(text) as ExportBundle
    updateStore((s) => importBundle(s, bundle, selectedGroupId ?? undefined))
  }

  const saveTemplate = (t: TaskRow) => {
    const tpl: TaskTemplate = {
      id: newId(),
      name: t.name,
      task: {
        name: t.name,
        mode: t.mode,
        amount: t.amount,
        tickers: t.tickers,
        brokers: t.brokers,
        notBrokers: t.notBrokers,
        dry: t.dry
      }
    }
    updateStore((s) => ({
      ...s,
      taskTemplates: [...(s.taskTemplates ?? []), tpl].slice(0, 50)
    }))
  }

  const deleteTask = (t: TaskRow) => {
    updateStore((s) => ({
      ...s,
      deletedTasksBackup: [{ task: t, deletedAt: new Date().toISOString() }, ...(s.deletedTasksBackup ?? [])].slice(
        0,
        10
      ),
      tasks: s.tasks.filter((x) => x.id !== t.id)
    }))
  }

  const undoDelete = () => {
    updateStore((s) => {
      const backup = s.deletedTasksBackup ?? []
      if (backup.length === 0) return s
      const [first, ...rest] = backup
      return {
        ...s,
        deletedTasksBackup: rest,
        tasks: [...s.tasks, first!.task]
      }
    })
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface">
      <BatchProgressBar progress={batchProgress} />
      {saveError && (
        <div className="bg-red-500/20 px-3 py-1 text-[11px] text-red-200">Save failed: {saveError}</div>
      )}
      <div className="mx-auto flex min-h-0 w-full max-w-[1920px] flex-1">
        <section className="flex w-72 shrink-0 flex-col border-r-2 border-surface-border bg-surface-raised">
          <div className="flex items-center justify-between border-b-2 border-surface-border px-2 py-2">
            <span className="pl-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Task groups
            </span>
            <button
              type="button"
              onClick={() => {
                const id = newId()
                updateStore((s) => ({
                  ...s,
                  groups: [...s.groups, { id, name: 'New group', sortOrder: s.groups.length }]
                }))
                setSelectedGroupId(id)
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-lg text-zinc-300 hover:bg-zinc-700"
            >
              +
            </button>
          </div>
          <input
            className="mx-2 mb-2 rounded-md border border-surface-border bg-[#0c0c0e] px-2 py-1.5 text-xs"
            placeholder="Search groups"
            value={groupSearch}
            onChange={(e) => setGroupSearch(e.target.value)}
          />
          <ul className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
            {filteredGroups.map((g) => (
              <GroupTreeItem
                key={g.id}
                group={g}
                childGroups={childGroups(g.id)}
                selectedGroupId={selectedGroupId}
                taskCount={store.tasks.filter((t) => t.groupId === g.id).length}
                onSelect={setSelectedGroupId}
                onAddChild={() => {
                  const id = newId()
                  updateStore((s) => ({
                    ...s,
                    groups: [...s.groups, { id, name: 'Sub-group', parentId: g.id, sortOrder: s.groups.length }]
                  }))
                  setSelectedGroupId(id)
                }}
              />
            ))}
          </ul>
        </section>

        <section className="flex min-w-0 flex-1 flex-col">
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
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white"
            >
              + Create task
            </button>
            {QUICK_TEMPLATES.map((qt) => (
              <button
                key={qt.label}
                type="button"
                onClick={() => {
                  if (!selectedGroupId) return
                  updateStore((s) => ({
                    ...s,
                    tasks: [...s.tasks, { ...defaultTask(selectedGroupId), ...qt.task } as TaskRow]
                  }))
                }}
                className="rounded-md border border-surface-border bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-200"
              >
                + {qt.label}
              </button>
            ))}
            {(store.taskTemplates ?? []).map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                title={`Template: ${tpl.name}`}
                onClick={() => {
                  if (!selectedGroupId) return
                  updateStore((s) => ({
                    ...s,
                    tasks: [
                      ...s.tasks,
                      { ...defaultTask(selectedGroupId), ...tpl.task, id: newId() } as TaskRow
                    ]
                  }))
                }}
                className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1.5 text-[10px] text-indigo-200"
              >
                tpl:{tpl.name}
              </button>
            ))}
            <button
              type="button"
              disabled={selectedTaskIds.size === 0 || running || !canRun}
              onClick={() => {
                const list = tasks.filter((t) => selectedTaskIds.has(t.id))
                void runBatch(list, store.settings, runCallbacks, cancelBatchRef, (t) =>
                  resolveRunOpts(t, store.settings)
                )
              }}
              className="rounded-md border border-surface-border bg-zinc-800 px-2 py-1.5 text-[11px] disabled:opacity-40"
            >
              Run selected ({selectedTaskIds.size})
            </button>
            <button
              type="button"
              onClick={() => setStartAllModalOpen(true)}
              disabled={running || tasks.length === 0 || !canRun}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
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
              className="rounded-md border border-surface-border bg-zinc-800 px-2 py-1.5 text-xs disabled:opacity-40"
            >
              Stop
            </button>
            <button type="button" onClick={undoDelete} className="text-[11px] text-zinc-500 hover:text-zinc-300">
              Undo delete
            </button>
            <button
              type="button"
              onClick={() =>
                downloadJson(`autorsa-tasks-${Date.now()}.json`, exportStoreSubset(store, selectedGroupId ?? undefined))
              }
              className="text-[11px] text-indigo-400"
            >
              Export
            </button>
            <label className="cursor-pointer text-[11px] text-indigo-400">
              Import
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void handleImport(f)
                }}
              />
            </label>
            <button type="button" onClick={() => setHistoryOpen((v) => !v)} className="text-[11px] text-zinc-400">
              History
            </button>
            <button type="button" onClick={() => setTasksHelpOpen(true)} className="text-[11px] text-zinc-400">
              ?
            </button>
            <input
              className="ml-auto min-w-[140px] rounded-md border border-surface-border bg-[#0c0c0e] px-2 py-1.5 text-xs"
              placeholder="Search tasks"
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-5 gap-2 border-b border-surface-border px-3 py-2 text-xs">
            <StatCard label="Total" value={String(stats.total)} />
            <StatCard label="Running" value={String(stats.running)} />
            <StatCard label="OK" value={String(stats.ok)} />
            <StatCard label="Failed" value={String(stats.err)} />
            <StatCard label="Group" value={selectedGroup?.name ?? '—'} small />
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className={'w-full border-collapse text-left ' + (taskDensity === 'compact' ? 'text-[11px]' : 'text-xs')}>
              <thead className="sticky top-0 bg-surface-raised/90">
                <tr className="text-zinc-500">
                  <th className="w-8 px-2 py-1">Sel</th>
                  <th className="px-2 py-1">Name</th>
                  <th className="px-2 py-1">Mode</th>
                  <th className="px-2 py-1">Brokers</th>
                  <th className="px-2 py-1">Dry</th>
                  <th className="px-2 py-1">Status</th>
                  <th className="w-48 px-2 py-1 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayTasks.map((t) => (
                  <tr
                    key={t.id}
                    className={
                      'border-b border-surface-border/60 hover:bg-white/[0.03] ' +
                      (t.id === selectedTaskId ? 'bg-indigo-500/10' : '')
                    }
                    onClick={() => setSelectedTaskId(t.id)}
                  >
                    <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                      />
                    </td>
                    <td className="px-2 py-1 font-medium text-zinc-200">{t.name}</td>
                    <td className="px-2 py-1 capitalize text-zinc-400">{t.mode}</td>
                    <td className="max-w-[120px] truncate px-2 py-1 font-mono text-[10px] text-zinc-500">
                      {t.brokers}
                    </td>
                    <td className="px-2 py-1">{t.dry ? 'Yes' : 'No'}</td>
                    <td className="px-2 py-1">
                      <StatusPill status={t.status} />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          disabled={running || !canRun}
                          title={runBlockedReason ?? 'Run'}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRunClick(t)
                          }}
                        >
                          ▶
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setEditId(t.id) }}>✎</button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); saveTemplate(t) }} title="Save template">★</button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            updateStore((s) => ({ ...s, tasks: moveTask(s.tasks, t.id, -1) }))
                          }}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            updateStore((s) => ({ ...s, tasks: moveTask(s.tasks, t.id, 1) }))
                          }}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            deleteTask(t)
                          }}
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

          <HoldingsComparePanel snapshots={store.holdingsSnapshots ?? []} />

          <OutputPanel
            log={log}
            onClear={() => setLog('')}
            onSave={() =>
              void window.api.saveLogFile({
                content: log,
                suggestedName: `autorsa-log-${Date.now()}.txt`
              })
            }
            heightPx={outputHeight}
            onHeightChange={setOutputHeight}
            collapsed={outputCollapsed}
            onToggleCollapse={() => setOutputCollapsed((v) => !v)}
          />

          {historyOpen && (
            <div className="h-44 shrink-0 border-t border-surface-border p-2">
              <div className="mb-1 text-[11px] uppercase text-zinc-500">Command history</div>
              <div className="h-36 overflow-auto rounded border border-surface-border bg-[#0a0a0c]">
                {(store.runHistory ?? []).length === 0 ? (
                  <p className="p-2 text-xs text-zinc-500">No runs yet.</p>
                ) : (
                  <table className="w-full text-[11px]">
                    <tbody>
                      {(store.runHistory ?? []).map((h) => (
                        <tr key={h.id} className="border-t border-surface-border/40">
                          <td className="px-2 py-1 text-zinc-400">{new Date(h.createdAt).toLocaleTimeString()}</td>
                          <td className="px-2 py-1">{h.taskName}</td>
                          <td className={'px-2 py-1 ' + (h.ok ? 'text-emerald-300' : 'text-red-300')}>
                            {h.ok ? 'ok' : 'err'}
                          </td>
                          <td className="px-2 py-1 font-mono text-zinc-500">{h.commandLine}</td>
                          <td className="px-2 py-1">
                            <button type="button" className="text-indigo-400" onClick={() => rerunFromHistory(h)}>
                              Re-run
                            </button>
                          </td>
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

      {brokerPickerTask && (
        <RunBrokerPicker
          open
          title={`Run: ${brokerPickerTask.name}`}
          onCancel={() => setBrokerPickerTask(null)}
          onConfirm={(brokerCliArg) => {
            executeRun(brokerPickerTask, brokerCliArg)
            setBrokerPickerTask(null)
          }}
        />
      )}

      {startAllModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-md border-2 border-surface-border bg-surface-raised p-5">
            <h2 className="text-sm font-semibold">Start all — review</h2>
            <ul className="mt-3 list-disc space-y-1 pl-4 text-xs text-zinc-400">
              <li>Tasks: {tasks.length}</li>
              <li>Global dry: {store.settings.forceDryRun ? 'on' : 'off'}</li>
              <li>Live tasks: {tasks.filter((t) => !isEffectiveDry(t, store.settings)).length}</li>
              <li>Continue on error: {store.settings.batchContinueOnError ? 'yes' : 'no'}</li>
              <li>Stagger: {store.settings.staggerDelaySec}s</li>
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setStartAllModalOpen(false)} className="text-xs">
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-accent px-3 py-1.5 text-xs text-white"
                onClick={() => {
                  setStartAllModalOpen(false)
                  void runBatch(tasks, store.settings, runCallbacks, cancelBatchRef, (t) =>
                    resolveRunOpts(t, store.settings)
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
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" onClick={() => setTasksHelpOpen(false)}>
          <div className="max-w-sm rounded-md border-2 border-surface-border bg-surface-raised p-4 text-xs" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold">Shortcuts</h2>
            <ul className="mt-2 space-y-1 text-zinc-300">
              <li>j / k — move selection</li>
              <li>Enter — run selected</li>
              <li>? — help</li>
              <li>Alt+T — tasks (global)</li>
            </ul>
            <button type="button" className="mt-4 w-full border border-surface-border py-1.5" onClick={() => setTasksHelpOpen(false)}>
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
            settings={store.settings}
            onClose={() => setEditId(null)}
            onSave={(t) => {
              updateStore((s) => ({ ...s, tasks: s.tasks.map((x) => (x.id === t.id ? t : x)) }))
              setEditId(null)
            }}
          />
        )
      })()}
    </div>
  )
}

function GroupTreeItem({
  group,
  childGroups,
  selectedGroupId,
  taskCount,
  onSelect,
  onAddChild
}: {
  group: TaskGroup
  childGroups: TaskGroup[]
  selectedGroupId: string | null
  taskCount: number
  onSelect: (id: string) => void
  onAddChild: () => void
}): React.JSX.Element {
  return (
    <li>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onSelect(group.id)}
          className={
            'mb-0.5 flex flex-1 items-center justify-between rounded-md px-2 py-2 text-left ' +
            (group.id === selectedGroupId ? 'bg-accent text-white' : 'text-zinc-300 hover:bg-white/5')
          }
        >
          <span className="truncate">{group.name}</span>
          <span className="text-[11px] opacity-80">{taskCount}</span>
        </button>
        <button type="button" className="text-[10px] text-zinc-600 hover:text-zinc-400" onClick={onAddChild} title="Add sub-group">
          +
        </button>
      </div>
      {childGroups.length > 0 && (
        <ul className="ml-3 border-l border-surface-border pl-1">
          {childGroups.map((cg) => (
            <li key={cg.id}>
              <button
                type="button"
                onClick={() => onSelect(cg.id)}
                className={
                  'mb-0.5 w-full rounded-md px-2 py-1.5 text-left text-[11px] ' +
                  (cg.id === selectedGroupId ? 'bg-accent/80 text-white' : 'text-zinc-400 hover:bg-white/5')
                }
              >
                ↳ {cg.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function StatCard({ label, value, small }: { label: string; value: string; small?: boolean }): React.JSX.Element {
  return (
    <div className="rounded border border-surface-border bg-surface-raised px-2 py-1">
      <div className="text-[10px] text-zinc-500">{label}</div>
      <div className={small ? 'truncate text-sm' : 'text-lg font-semibold'}>{value}</div>
    </div>
  )
}

function StatusPill({ status }: { status: TaskRow['status'] }): React.JSX.Element {
  const cls =
    status === 'ok'
      ? 'bg-emerald-500/20 text-emerald-300'
      : status === 'error'
        ? 'bg-red-500/20 text-red-300'
        : status === 'running'
          ? 'bg-amber-500/20 text-amber-200'
          : 'bg-zinc-700/50 text-zinc-500'
  return <span className={'rounded px-1.5 py-0.5 text-[10px] uppercase ' + cls}>{status}</span>
}

import type { Store, TaskGroup, TaskRow, TaskTemplate } from '../types'

export type ExportBundle = {
  version: 1
  exportedAt: string
  groups: TaskGroup[]
  tasks: TaskRow[]
  taskTemplates?: TaskTemplate[]
}

export function exportStoreSubset(store: Store, groupId?: string): ExportBundle {
  const tasks = groupId
    ? store.tasks.filter((t) => t.groupId === groupId)
    : store.tasks
  const groupIds = new Set(tasks.map((t) => t.groupId))
  const groups = store.groups.filter((g) => groupIds.has(g.id))
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    groups,
    tasks,
    taskTemplates: store.taskTemplates
  }
}

export function importBundle(
  store: Store,
  bundle: ExportBundle,
  targetGroupId?: string
): Store {
  if (bundle.version !== 1) throw new Error('Unsupported export version')
  const idMap = new Map<string, string>()
  let groups = [...store.groups]
  for (const g of bundle.groups) {
    const newId = crypto.randomUUID()
    idMap.set(g.id, newId)
    groups.push({ ...g, id: newId })
  }
  const tasks = [...store.tasks]
  for (const t of bundle.tasks) {
    const gid = targetGroupId ?? idMap.get(t.groupId) ?? store.groups[0]?.id
    if (!gid) continue
    tasks.push({
      ...t,
      id: crypto.randomUUID(),
      groupId: gid,
      status: 'idle',
      lastError: undefined,
      lastRun: undefined
    })
  }
  return { ...store, groups, tasks }
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

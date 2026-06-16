import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { defaultSettings, sanitizeStore } from '../shared/sanitizeStore'
import type { Store } from '../shared/types'

export function defaultDataDir(): string {
  return join(app.getPath('userData'), 'rsa-data')
}

export function storePath(): string {
  return join(app.getPath('userData'), 'store.json')
}

export function storeBackupPath(): string {
  return join(app.getPath('userData'), 'store.json.bak')
}

function projectDefaults(projectRoot: string): ReturnType<typeof defaultSettings> {
  return defaultSettings(
    defaultDataDir(),
    join(projectRoot, 'python', 'venv', 'Scripts', 'auto_rsa_bot.exe')
  )
}

export function loadStore(projectRoot: string): Store {
  const path = storePath()
  const ds = projectDefaults(projectRoot)
  if (!existsSync(path)) {
    return {
      settings: ds,
      groups: [],
      tasks: [],
      onboardingComplete: false,
      runStats: { ok: 0, err: 0 },
      taskTemplates: [],
      scheduledJobs: [],
      holdingsSnapshots: [],
      deletedTasksBackup: []
    }
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as Store
    if (!parsed.settings) parsed.settings = ds
    parsed.settings = { ...ds, ...parsed.settings }
    if (typeof parsed.onboardingComplete !== 'boolean') {
      parsed.onboardingComplete = true
    }
    return sanitizeStore(parsed, ds)
  } catch {
    const bak = storeBackupPath()
    if (existsSync(bak)) {
      try {
        const parsed = JSON.parse(readFileSync(bak, 'utf-8')) as Store
        return sanitizeStore(parsed, ds)
      } catch {
        /* fall through */
      }
    }
    return {
      settings: ds,
      groups: [],
      tasks: [],
      onboardingComplete: true,
      runStats: { ok: 0, err: 0 },
      taskTemplates: [],
      scheduledJobs: [],
      holdingsSnapshots: [],
      deletedTasksBackup: []
    }
  }
}

/** Atomic write: temp file + rename; keep .bak of previous. */
export function saveStore(store: Store, projectRoot: string): { ok: true } | { ok: false; error: string } {
  const ds = projectDefaults(projectRoot)
  const sanitized = sanitizeStore(store, ds)
  const path = storePath()
  const dir = dirname(path)
  const tmp = path + '.tmp'
  try {
    mkdirSync(dir, { recursive: true })
    if (existsSync(path)) {
      try {
        copyFileSync(path, storeBackupPath())
      } catch {
        /* ignore backup failure */
      }
    }
    writeFileSync(tmp, JSON.stringify(sanitized, null, 2), 'utf-8')
    renameSync(tmp, path)
    return { ok: true }
  } catch (e) {
    try {
      if (existsSync(tmp)) unlinkSync(tmp)
    } catch {
      /* ignore */
    }
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function ensureEnvDir(dir: string, projectRoot: string): void {
  mkdirSync(dir, { recursive: true })
  const envFile = join(dir, '.env')
  const example = join(projectRoot, 'python', '.env.example')
  if (!existsSync(envFile) && existsSync(example)) {
    try {
      copyFileSync(example, envFile)
    } catch {
      /* ignore */
    }
  }
}

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let activeRsa: ChildProcess | null = null

function projectRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app')
  }
  return join(__dirname, '../..')
}

function defaultDataDir(): string {
  return join(app.getPath('userData'), 'rsa-data')
}

type AppSettings = {
  envDirectory: string
  autoRsaExecutable: string
  maxLogChars: number
  commandTimeoutSec: number
}

type TaskRow = {
  id: string
  groupId: string
  name: string
  mode: 'buy' | 'sell' | 'holdings'
  amount: number
  tickers: string
  brokers: string
  notBrokers: string
  dry: boolean
  status: 'idle' | 'running' | 'ok' | 'error'
  lastError?: string
  lastRun?: string
}

type TaskGroup = {
  id: string
  name: string
  parentId?: string
}

type Store = {
  settings: AppSettings
  groups: TaskGroup[]
  tasks: TaskRow[]
}

const defaultSettings = (): AppSettings => ({
  envDirectory: defaultDataDir(),
  autoRsaExecutable: join(projectRoot(), 'python', 'venv', 'Scripts', 'auto_rsa_bot.exe'),
  maxLogChars: 400_000,
  commandTimeoutSec: 0
})

function storePath(): string {
  return join(app.getPath('userData'), 'store.json')
}

function loadStore(): Store {
  const path = storePath()
  if (!existsSync(path)) {
    return { settings: defaultSettings(), groups: [], tasks: [] }
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as Store
    if (!parsed.settings) parsed.settings = defaultSettings()
    parsed.settings = { ...defaultSettings(), ...parsed.settings }
    if (typeof parsed.settings.maxLogChars !== 'number' || parsed.settings.maxLogChars < 5_000) {
      parsed.settings.maxLogChars = defaultSettings().maxLogChars
    }
    if (typeof parsed.settings.commandTimeoutSec !== 'number' || parsed.settings.commandTimeoutSec < 0) {
      parsed.settings.commandTimeoutSec = 0
    }
    if (!parsed.groups) parsed.groups = []
    if (!parsed.tasks) parsed.tasks = []
    return parsed
  } catch {
    return { settings: defaultSettings(), groups: [], tasks: [] }
  }
}

function saveStore(store: Store): void {
  mkdirSync(dirname(storePath()), { recursive: true })
  writeFileSync(storePath(), JSON.stringify(store, null, 2), 'utf-8')
}

function ensureEnvDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
  const envFile = join(dir, '.env')
  const example = join(projectRoot(), 'python', '.env.example')
  if (!existsSync(envFile) && existsSync(example)) {
    try {
      copyFileSync(example, envFile)
    } catch {
      /* ignore */
    }
  }
}

function preloadPath(): string {
  const candidates: string[] = []
  try {
    const appPath = app.getAppPath()
    candidates.push(
      join(appPath, 'out', 'preload', 'index.mjs'),
      join(appPath, 'out', 'preload', 'index.js')
    )
  } catch {
    /* not ready (should not happen from createWindow) */
  }
  candidates.push(
    join(__dirname, '../preload/index.mjs'),
    join(__dirname, '../preload/index.js')
  )
  for (const p of candidates) {
    if (existsSync(p)) {
      const abs = resolve(p)
      console.log('[main] Preload file:', abs)
      return abs
    }
  }
  const fallback = resolve(candidates[0] ?? join(__dirname, '../preload/index.mjs'))
  console.error('[main] No preload on disk. Tried:', candidates)
  return fallback
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0f0f12',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      // Avoid rare Windows issues where a sandboxed renderer fails to run the preload.
      sandbox: false
    },
    title: 'AutoRSA Desktop',
    show: false
  })
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    mainWindow.loadURL(devUrl).catch((e) => {
      console.error('Failed to load dev URL', devUrl, e)
    })
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.openDevTools({ mode: 'detach' })
    })
    mainWindow.webContents.on('did-fail-load', (_e, code, reason, url) => {
      console.error('Renderer did-fail-load', { code, reason, url })
    })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Register every IPC channel before the first loadURL, so the renderer never invokes too early.
  ipcMain.handle('store:load', (): Store => {
    const s = loadStore()
    ensureEnvDir(s.settings.envDirectory)
    return s
  })

  ipcMain.handle('store:save', (_e, store: Store) => {
    saveStore(store)
  })

  ipcMain.handle('dialog:pickDirectory', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory', 'createDirectory']
    })
    if (r.canceled || !r.filePaths[0]) return null
    return r.filePaths[0]
  })

  ipcMain.handle('dialog:pickExecutable', async () => {
    const r = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openFile'],
      filters: [{ name: 'Executable', extensions: ['exe', 'cmd', 'bat'] }]
    })
    if (r.canceled || !r.filePaths[0]) return null
    return r.filePaths[0]
  })

  ipcMain.handle('shell:openPath', async (_e, p: string) => {
    await shell.openPath(p)
  })

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle(
    'rsa:run',
    async (
      _e,
      payload: {
        args: string[]
        cwd: string
        autoRsaExecutable: string
        timeoutMs?: number
      }
    ) => {
      if (activeRsa) {
        return { ok: false, error: 'A command is already running. Stop it first.' }
      }
      const exe = payload.autoRsaExecutable
      if (!existsSync(exe)) {
        return {
          ok: false,
          error: `auto_rsa_bot not found at:\n${exe}\n\nRun ${join(projectRoot(), 'python', 'setup.ps1')} or set the path in Settings.`
        }
      }
      ensureEnvDir(payload.cwd)

      return await new Promise<{ ok: boolean; code: number; error?: string }>((resolve) => {
        const env = {
          ...process.env,
          DANGER_MODE: 'true',
          PYTHONUNBUFFERED: '1'
        } as NodeJS.ProcessEnv

        const child = spawn(exe, payload.args, {
          cwd: payload.cwd,
          env,
          shell: false
        })
        activeRsa = child
        const timeoutMs = payload.timeoutMs
        let timedOut = false
        let settled = false
        let timer: ReturnType<typeof setTimeout> | null = null
        if (timeoutMs != null && timeoutMs > 0) {
          timer = setTimeout(() => {
            timedOut = true
            try {
              child.kill('SIGTERM')
            } catch {
              /* ignore */
            }
          }, timeoutMs)
        }

        const send = (chunk: Buffer) => {
          const t = chunk.toString()
          mainWindow?.webContents.send('rsa:log', t)
        }
        child.stdout?.on('data', send)
        child.stderr?.on('data', send)

        const finish = (result: { ok: boolean; code: number; error?: string }) => {
          if (settled) return
          settled = true
          if (timer) {
            clearTimeout(timer)
            timer = null
          }
          if (activeRsa === child) activeRsa = null
          resolve(result)
        }

        child.on('error', (err) => {
          finish({ ok: false, code: -1, error: String(err) })
        })
        child.on('close', (code) => {
          if (timedOut) {
            finish({ ok: false, code: -2, error: 'Command timed out (see Settings → timeout).' })
            return
          }
          finish({ ok: code === 0, code: code ?? 0 })
        })
      })
    }
  )

  ipcMain.handle('rsa:stop', () => {
    if (activeRsa) {
      try {
        activeRsa.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      activeRsa = null
    }
  })

  ipcMain.handle('app:getPaths', () => ({
    userData: app.getPath('userData'),
    projectRoot: projectRoot()
  }))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

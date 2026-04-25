import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'

import { explainBotLaunchFailure, resolveBotLaunch, resolveDirectBotExecutable } from './botLaunch'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let activeRsa: ChildProcess | null = null
let rsaUserStopRequested = false
const LATEST_KNOWN_AUTORSA = '2.1.0'

function projectRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app')
  }
  return join(__dirname, '../..')
}

function defaultDataDir(): string {
  return join(app.getPath('userData'), 'rsa-data')
}

/** Direct console script only (used to canonicalize saved path when an .exe/.cmd exists). */
function resolveExecutableForSpawn(raw: string): string | null {
  return resolveDirectBotExecutable(raw ?? '', projectRoot(), process.platform)
}

/** Persist a working absolute path when we can resolve the configured value. */
function canonicalizeBotPath(settings: AppSettings): void {
  const resolved = resolveExecutableForSpawn(settings.autoRsaExecutable)
  if (resolved) {
    settings.autoRsaExecutable = resolved
  }
}

function isExistingDirectory(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** Resolve working directory the same way for path checks, mkdir, and spawn cwd. */
function firstExistingEnvDir(raw: string): string | null {
  const t = (raw ?? '').trim()
  if (!t) return null
  const candidates: string[] = []
  candidates.push(resolve(t))
  if (!isAbsolute(t)) {
    candidates.push(resolve(join(projectRoot(), t)))
    candidates.push(resolve(join(projectRoot(), t.replace(/^[/\\]+/, ''))))
  }
  const seen = new Set<string>()
  for (const c of candidates) {
    const key = normalize(c).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (isExistingDirectory(c)) return normalize(c)
  }
  return null
}

/** Absolute cwd for runs (directory may be created by ensureEnvDir). */
function resolveCwdForRun(raw: string): string {
  const t = (raw ?? '').trim()
  if (!t) return defaultDataDir()
  const found = firstExistingEnvDir(t)
  if (found) return found
  const r = resolve(t)
  if (!isAbsolute(t)) {
    return normalize(resolve(join(projectRoot(), t.replace(/^[/\\]+/, ''))))
  }
  return normalize(r)
}

function canonicalizeEnvDirectory(settings: AppSettings): void {
  const raw = settings.envDirectory?.trim() ?? ''
  if (!raw) {
    settings.envDirectory = defaultDataDir()
    return
  }
  const found = firstExistingEnvDir(raw)
  if (found) {
    settings.envDirectory = found
  }
}

function sanitizeStoreForSave(incoming: Store): Store {
  const ds = defaultSettings()
  const s: Store = {
    ...incoming,
    settings: { ...ds, ...incoming.settings },
    groups: Array.isArray(incoming.groups) ? incoming.groups : [],
    tasks: Array.isArray(incoming.tasks) ? incoming.tasks : [],
    runStats: {
      ok: Math.max(0, Math.floor(incoming.runStats?.ok ?? 0)),
      err: Math.max(0, Math.floor(incoming.runStats?.err ?? 0))
    },
    onboardingComplete: incoming.onboardingComplete,
    runHistory: Array.isArray(incoming.runHistory) ? incoming.runHistory.slice(0, 50) : []
  }
  if (typeof s.settings.maxLogChars !== 'number' || s.settings.maxLogChars < 5_000) {
    s.settings.maxLogChars = ds.maxLogChars
  }
  if (typeof s.settings.commandTimeoutSec !== 'number' || s.settings.commandTimeoutSec < 0) {
    s.settings.commandTimeoutSec = 0
  }
  if (typeof s.settings.forceDryRun !== 'boolean') s.settings.forceDryRun = false
  if (!s.settings.retryOnFailure || typeof s.settings.retryOnFailure !== 'object') {
    s.settings.retryOnFailure = { enabled: false, maxAttempts: 2 }
  } else {
    const m = Math.max(1, Math.min(20, Math.floor(s.settings.retryOnFailure.maxAttempts || 2)))
    s.settings.retryOnFailure = {
      enabled: Boolean(s.settings.retryOnFailure.enabled),
      maxAttempts: m
    }
  }
  if (!s.settings.brokerProfile || typeof s.settings.brokerProfile !== 'object') {
    s.settings.brokerProfile = { include: 'all', exclude: '', applyToAllKeyword: true }
  } else {
    s.settings.brokerProfile = {
      include: String(s.settings.brokerProfile.include ?? 'all'),
      exclude: String(s.settings.brokerProfile.exclude ?? ''),
      applyToAllKeyword: Boolean(s.settings.brokerProfile.applyToAllKeyword)
    }
  }
  if (!s.settings.riskGuard || typeof s.settings.riskGuard !== 'object') {
    s.settings.riskGuard = { enabled: true, maxSharesPerOrder: 1 }
  } else {
    s.settings.riskGuard = {
      enabled: Boolean(s.settings.riskGuard.enabled),
      maxSharesPerOrder: Math.max(1, Math.floor(Number(s.settings.riskGuard.maxSharesPerOrder) || 1))
    }
  }
  if (typeof s.settings.telemetryLocalEnabled !== 'boolean') {
    s.settings.telemetryLocalEnabled = false
  }
  delete (s.settings as { theme?: unknown }).theme
  canonicalizeEnvDirectory(s.settings)
  canonicalizeBotPath(s.settings)
  return s
}

type AppSettings = {
  envDirectory: string
  autoRsaExecutable: string
  maxLogChars: number
  commandTimeoutSec: number
  forceDryRun: boolean
  retryOnFailure: { enabled: boolean; maxAttempts: number }
  brokerProfile: { include: string; exclude: string; applyToAllKeyword: boolean }
  riskGuard: { enabled: boolean; maxSharesPerOrder: number }
  telemetryLocalEnabled: boolean
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
  onboardingComplete?: boolean
  runStats: { ok: number; err: number }
  runHistory?: Array<{
    id: string
    taskId: string
    taskName: string
    mode: TaskRow['mode']
    commandLine: string
    cwd: string
    ok: boolean
    code: number
    exitKind?: 'normal' | 'timeout' | 'spawn_error' | 'user_stopped' | 'signal'
    elapsedSec: number
    createdAt: string
  }>
}

const defaultSettings = (): AppSettings => ({
  envDirectory: defaultDataDir(),
  autoRsaExecutable: join(projectRoot(), 'python', 'venv', 'Scripts', 'auto_rsa_bot.exe'),
  maxLogChars: 400_000,
  commandTimeoutSec: 0,
  forceDryRun: false,
  retryOnFailure: { enabled: false, maxAttempts: 2 },
  brokerProfile: { include: 'all', exclude: '', applyToAllKeyword: true },
  riskGuard: { enabled: true, maxSharesPerOrder: 1 },
  telemetryLocalEnabled: false
})

function storePath(): string {
  return join(app.getPath('userData'), 'store.json')
}

function loadStore(): Store {
  const path = storePath()
  if (!existsSync(path)) {
    return {
      settings: defaultSettings(),
      groups: [],
      tasks: [],
      onboardingComplete: false,
      runStats: { ok: 0, err: 0 }
    }
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as Store
    if (!parsed.settings) parsed.settings = defaultSettings()
    const ds = defaultSettings()
    parsed.settings = { ...ds, ...parsed.settings }
    if (typeof parsed.settings.maxLogChars !== 'number' || parsed.settings.maxLogChars < 5_000) {
      parsed.settings.maxLogChars = ds.maxLogChars
    }
    if (typeof parsed.settings.commandTimeoutSec !== 'number' || parsed.settings.commandTimeoutSec < 0) {
      parsed.settings.commandTimeoutSec = 0
    }
    if (typeof parsed.settings.forceDryRun !== 'boolean') {
      parsed.settings.forceDryRun = false
    }
    if (!parsed.settings.retryOnFailure || typeof parsed.settings.retryOnFailure !== 'object') {
      parsed.settings.retryOnFailure = { enabled: false, maxAttempts: 2 }
    } else {
      const m = Math.max(1, Math.min(20, Math.floor(parsed.settings.retryOnFailure.maxAttempts || 2)))
      parsed.settings.retryOnFailure = {
        enabled: Boolean(parsed.settings.retryOnFailure.enabled),
        maxAttempts: m
      }
    }
    if (!parsed.settings.brokerProfile || typeof parsed.settings.brokerProfile !== 'object') {
      parsed.settings.brokerProfile = { include: 'all', exclude: '', applyToAllKeyword: true }
    } else {
      parsed.settings.brokerProfile = {
        include: String(parsed.settings.brokerProfile.include ?? 'all'),
        exclude: String(parsed.settings.brokerProfile.exclude ?? ''),
        applyToAllKeyword: Boolean(parsed.settings.brokerProfile.applyToAllKeyword)
      }
    }
    if (!parsed.settings.riskGuard || typeof parsed.settings.riskGuard !== 'object') {
      parsed.settings.riskGuard = { enabled: true, maxSharesPerOrder: 1 }
    } else {
      parsed.settings.riskGuard = {
        enabled: Boolean(parsed.settings.riskGuard.enabled),
        maxSharesPerOrder: Math.max(1, Math.floor(Number(parsed.settings.riskGuard.maxSharesPerOrder) || 1))
      }
    }
    delete (parsed.settings as { theme?: unknown }).theme
    if (typeof parsed.settings.telemetryLocalEnabled !== 'boolean') {
      parsed.settings.telemetryLocalEnabled = false
    }
    if (!parsed.groups) parsed.groups = []
    if (!parsed.tasks) parsed.tasks = []
    if (typeof parsed.onboardingComplete !== 'boolean') {
      parsed.onboardingComplete = true
    }
    parsed.runStats = {
      ok: Math.max(0, Math.floor((parsed as Store).runStats?.ok ?? 0)),
      err: Math.max(0, Math.floor((parsed as Store).runStats?.err ?? 0))
    }
    parsed.runHistory = Array.isArray(parsed.runHistory) ? parsed.runHistory.slice(0, 50) : []
    const exeBefore = parsed.settings.autoRsaExecutable
    const envBefore = parsed.settings.envDirectory
    canonicalizeEnvDirectory(parsed.settings)
    canonicalizeBotPath(parsed.settings)
    if (
      exeBefore !== parsed.settings.autoRsaExecutable ||
      envBefore !== parsed.settings.envDirectory
    ) {
      try {
        saveStore(parsed)
      } catch {
        /* ignore */
      }
    }
    return parsed
  } catch {
    return {
      settings: defaultSettings(),
      groups: [],
      tasks: [],
      onboardingComplete: true,
      runStats: { ok: 0, err: 0 }
    } satisfies Store
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

function parseEnvKeys(cwd: string): string[] {
  const p = join(cwd, '.env')
  if (!existsSync(p)) return []
  try {
    const raw = readFileSync(p, 'utf-8')
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#') && l.includes('='))
      .map((l) => l.split('=')[0]?.trim() ?? '')
      .filter((k) => k.length > 0)
  } catch {
    return []
  }
}

function venvPythonPath(pr: string): string {
  const win = join(pr, 'python', 'venv', 'Scripts', 'python.exe')
  if (existsSync(win)) return win
  return join(pr, 'python', 'venv', 'bin', 'python')
}

function envDoctorReport(): {
  ok: boolean
  checks: Array<{ label: string; ok: boolean; detail: string }>
  fixCommand: string
} {
  const pr = projectRoot()
  const py = venvPythonPath(pr)
  const checks: Array<{ label: string; ok: boolean; detail: string }> = []
  const pyExists = existsSync(py)
  checks.push({ label: 'Venv Python', ok: pyExists, detail: py })
  if (!pyExists) {
    return {
      ok: false,
      checks,
      fixCommand: `powershell -ExecutionPolicy Bypass -File "${join(pr, 'python', 'setup.ps1')}"`
    }
  }
  const mods = ['auto_rsa_bot', 'pytz', 'playwright']
  for (const m of mods) {
    const r = spawnSync(py, ['-c', `import importlib.util; raise SystemExit(0 if importlib.util.find_spec("${m}") else 1)`], {
      stdio: 'pipe',
      windowsHide: true
    })
    checks.push({
      label: `Python module: ${m}`,
      ok: r.status === 0,
      detail: r.status === 0 ? 'ok' : (r.stderr?.toString() || 'missing').trim()
    })
  }
  return {
    ok: checks.every((c) => c.ok),
    checks,
    fixCommand: `"${py}" -m pip install -r "${join(pr, 'python', 'requirements.txt')}" && "${py}" -m playwright install`
  }
}

function runEnvDoctorFix(): { ok: boolean; output: string } {
  const pr = projectRoot()
  const py = venvPythonPath(pr)
  if (!existsSync(py)) {
    return {
      ok: false,
      output: `Venv Python not found. Run: powershell -ExecutionPolicy Bypass -File "${join(pr, 'python', 'setup.ps1')}"`
    }
  }
  const steps: Array<{ args: string[]; label: string }> = [
    { label: 'Upgrade pip', args: ['-m', 'pip', 'install', '-U', 'pip'] },
    { label: 'Install requirements', args: ['-m', 'pip', 'install', '-r', join(pr, 'python', 'requirements.txt')] },
    { label: 'Install Playwright browsers', args: ['-m', 'playwright', 'install'] }
  ]
  let out = ''
  for (const s of steps) {
    out += `\n# ${s.label}\n`
    const r = spawnSync(py, s.args, { stdio: 'pipe', windowsHide: true })
    out += (r.stdout?.toString() ?? '') + (r.stderr?.toString() ?? '')
    if (r.status !== 0) {
      return { ok: false, output: out }
    }
  }
  return { ok: true, output: out }
}

function autoRsaVersionStatus(): {
  installedVersion: string | null
  latestKnownVersion: string
  upToDate: boolean | null
  detail: string
} {
  const py = venvPythonPath(projectRoot())
  if (!existsSync(py)) {
    return {
      installedVersion: null,
      latestKnownVersion: LATEST_KNOWN_AUTORSA,
      upToDate: null,
      detail: 'Venv python missing.'
    }
  }
  const r = spawnSync(
    py,
    ['-c', "import importlib.metadata as m; print(m.version('auto_rsa_bot'))"],
    { stdio: 'pipe', windowsHide: true }
  )
  if (r.status !== 0) {
    return {
      installedVersion: null,
      latestKnownVersion: LATEST_KNOWN_AUTORSA,
      upToDate: null,
      detail: (r.stderr?.toString() || 'auto_rsa_bot not installed').trim()
    }
  }
  const installed = (r.stdout?.toString() || '').trim() || null
  return {
    installedVersion: installed,
    latestKnownVersion: LATEST_KNOWN_AUTORSA,
    upToDate: installed == null ? null : installed === LATEST_KNOWN_AUTORSA,
    detail: installed == null ? 'Unknown version.' : 'ok'
  }
}

function setApplicationMenu(): void {
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' }
          ]
        }
      ])
    )
  } else {
    Menu.setApplicationMenu(null)
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
      return resolve(p)
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
  // Remove the default File / Edit / View / … bar (all platforms).
  setApplicationMenu()

  // Register every IPC channel before the first loadURL, so the renderer never invokes too early.
  ipcMain.handle('store:load', (): Store => {
    const s = loadStore()
    ensureEnvDir(resolveCwdForRun(s.settings.envDirectory))
    return s
  })

  ipcMain.handle('store:save', (_e, store: Store) => {
    saveStore(sanitizeStoreForSave(store))
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
      filters: [
        { name: 'Executable', extensions: ['exe', 'cmd', 'bat', 'com'] },
        { name: 'All files', extensions: ['*'] }
      ]
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
      rsaUserStopRequested = false
      const rawExe = payload.autoRsaExecutable
      const launch = resolveBotLaunch(rawExe ?? '', projectRoot(), process.platform)
      if (launch == null) {
        return {
          ok: false,
          error: `auto_rsa_bot not found at:\n${rawExe.trim() || '(empty)'}\n\nInstall the venv (${join(projectRoot(), 'python', 'setup.ps1')}) so you have either python\\venv\\Scripts\\auto_rsa_bot.exe or the package importable as python -m auto_rsa_bot.`
        }
      }
      const cwd = resolveCwdForRun(payload.cwd)
      ensureEnvDir(cwd)

      return await new Promise<{
        ok: boolean
        code: number
        error?: string
        exitKind?: 'normal' | 'timeout' | 'spawn_error' | 'user_stopped' | 'signal'
      }>((resolve) => {
        const env = {
          ...process.env,
          DANGER_MODE: 'true',
          PYTHONUNBUFFERED: '1'
        } as NodeJS.ProcessEnv

        const spawnArgs = [...launch.prependArgs, ...payload.args]
        const winCmd =
          process.platform === 'win32' && /\.(cmd|bat)$/i.test(launch.command)
        const child = spawn(launch.command, spawnArgs, {
          cwd,
          env,
          shell: winCmd,
          windowsHide: true
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

        const finish = (result: {
          ok: boolean
          code: number
          error?: string
          exitKind?: 'normal' | 'timeout' | 'spawn_error' | 'user_stopped' | 'signal'
        }) => {
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
          finish({ ok: false, code: -1, error: String(err), exitKind: 'spawn_error' })
        })
        child.on('close', (code, signal) => {
          if (timedOut) {
            finish({
              ok: false,
              code: -2,
              error: 'Command timed out (see Settings → timeout).',
              exitKind: 'timeout'
            })
            return
          }
          if (rsaUserStopRequested) {
            rsaUserStopRequested = false
            finish({
              ok: false,
              code: code ?? -5,
              error: 'Stopped (Stop button or system interrupt).',
              exitKind: 'user_stopped'
            })
            return
          }
          if (signal) {
            finish({
              ok: false,
              code: -6,
              error: `Process ended by signal: ${signal}.`,
              exitKind: 'signal'
            })
            return
          }
          if (code == null) {
            finish({
              ok: false,
              code: -7,
              error: 'Process exited with no code (killed or crashed).',
              exitKind: 'signal'
            })
            return
          }
          finish({ ok: code === 0, code, exitKind: 'normal' })
        })
      })
    }
  )

  ipcMain.handle('rsa:stop', () => {
    if (activeRsa) {
      rsaUserStopRequested = true
      try {
        activeRsa.kill('SIGTERM')
      } catch {
        /* ignore */
      }
      activeRsa = null
    }
  })

  ipcMain.handle('app:setWindowTitle', (_e, title: string) => {
    if (mainWindow && typeof title === 'string') {
      mainWindow.setTitle(title)
    }
  })

  ipcMain.handle('app:getPaths', () => {
    const pr = projectRoot()
    return {
      userData: app.getPath('userData'),
      projectRoot: pr,
      platform: process.platform,
      pythonVenvScripts: join(pr, 'python', 'venv', 'Scripts'),
      pythonVenvBin: join(pr, 'python', 'venv', 'bin')
    }
  })

  ipcMain.handle(
    'fs:pathStatus',
    (
      _e,
      payload: { envDirectory: string; autoRsaExecutable: string }
    ): {
      envDirExists: boolean
      envFileExists: boolean
      exeExists: boolean
      botResolvedSummary: string | null
      botSetupHint: string | null
    } => {
      const dir = payload.envDirectory?.trim() ?? ''
      const exe = payload.autoRsaExecutable?.trim() ?? ''
      const dirResolved = dir.length > 0 ? firstExistingEnvDir(dir) : null
      const pr = projectRoot()
      const launch = resolveBotLaunch(exe, pr, process.platform)
      return {
        envDirExists: dirResolved != null,
        envFileExists:
          dirResolved != null && existsSync(join(dirResolved, '.env')),
        exeExists: launch != null,
        botResolvedSummary: launch
          ? launch.kind === 'python_module'
            ? `Runs with: ${basename(launch.command)} -m auto_rsa_bot`
            : `Runs with: ${basename(launch.command)}`
          : null,
        botSetupHint: launch ? null : explainBotLaunchFailure(exe, pr, process.platform)
      }
    }
  )

  ipcMain.handle('fs:envSummary', (_e, payload: { envDirectory: string }) => {
    const cwd = resolveCwdForRun(payload.envDirectory ?? '')
    const keys = parseEnvKeys(cwd)
    return { cwd, keys }
  })

  ipcMain.handle('env:doctor', () => envDoctorReport())
  ipcMain.handle('env:doctorFix', () => runEnvDoctorFix())
  ipcMain.handle('env:versionStatus', () => autoRsaVersionStatus())

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  Notification
} from 'electron'
import { autoUpdater } from 'electron-updater'

import { appendLiveRunAudit } from './audit'
import {
  autoRsaVersionStatus,
  envDoctorReport,
  maskEnvForDisplay,
  parseEnvKeys,
  readEnvFile,
  runAutoRsaUpgrade,
  runEnvDoctorFix,
  writeEnvFile
} from './envTools'
import {
  validateEnvWritePayload,
  validatePathPayload,
  validateRunPayload,
  validateSaveLogPayload,
  validateStorePayload
} from './ipcValidate'
import { firstExistingEnvDir, resolveCwdForRun, canonicalizeEnvDirectory } from './paths'
import { killProcessTree } from './processTree'
import { startSchedulePoller, stopSchedulePoller } from './scheduler'
import { defaultDataDir, ensureEnvDir, loadStore, saveStore } from './store'
import { explainBotLaunchFailure, resolveBotLaunch, resolveDirectBotExecutable } from './botLaunch'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null
let activeRsa: ChildProcess | null = null
let rsaUserStopRequested = false
let cachedStore: ReturnType<typeof loadStore> | null = null

function projectRoot(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'app')
  }
  return join(__dirname, '../..')
}

function resolveExecutableForSpawn(raw: string): string | null {
  return resolveDirectBotExecutable(raw ?? '', projectRoot(), process.platform)
}

function canonicalizeBotPath(settings: { autoRsaExecutable: string }): void {
  const resolved = resolveExecutableForSpawn(settings.autoRsaExecutable)
  if (resolved) {
    settings.autoRsaExecutable = resolved
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
    /* not ready */
  }
  candidates.push(join(__dirname, '../preload/index.mjs'), join(__dirname, '../preload/index.js'))
  for (const p of candidates) {
    if (existsSync(p)) return resolve(p)
  }
  const fallback = resolve(candidates[0] ?? join(__dirname, '../preload/index.mjs'))
  console.error('[main] No preload on disk. Tried:', candidates)
  return fallback
}

function createWindow(): void {
  const openDevTools = process.env['ARSA_OPEN_DEVTOOLS'] === '1'
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
      sandbox: true
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
    if (openDevTools) {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow?.webContents.openDevTools({ mode: 'detach' })
      })
    }
    mainWindow.webContents.on('did-fail-load', (_e, code, reason, url) => {
      console.error('Renderer did-fail-load', { code, reason, url })
    })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('store:load', (): ReturnType<typeof loadStore> => {
    const pr = projectRoot()
    const s = loadStore(pr)
    canonicalizeBotPath(s.settings)
    canonicalizeEnvDirectory(s.settings, pr, defaultDataDir())
    ensureEnvDir(resolveCwdForRun(s.settings.envDirectory, pr, defaultDataDir()), pr)
    cachedStore = s
    return s
  })

  ipcMain.handle('store:save', (_e, store: unknown) => {
    if (!validateStorePayload(store)) {
      return { ok: false, error: 'Invalid store payload' }
    }
    canonicalizeBotPath(store.settings)
    const result = saveStore(store, projectRoot())
    if (result.ok) cachedStore = store
    return result
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

  ipcMain.handle('dialog:saveFile', async (_e, payload: unknown) => {
    if (!validateSaveLogPayload(payload)) return { ok: false, error: 'Invalid payload' }
    const r = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: payload.suggestedName ?? 'autorsa-log.txt',
      filters: [{ name: 'Text', extensions: ['txt', 'log'] }]
    })
    if (r.canceled || !r.filePath) return { ok: false, cancelled: true }
    try {
      writeFileSync(r.filePath, payload.content, 'utf-8')
      return { ok: true, path: r.filePath }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('shell:openPath', async (_e, p: string) => {
    if (typeof p !== 'string') return
    await shell.openPath(p)
  })

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    if (typeof url !== 'string') return
    await shell.openExternal(url)
  })

  ipcMain.handle('rsa:run', async (_e, payload: unknown) => {
    if (!validateRunPayload(payload)) {
      return { ok: false, code: -1, error: 'Invalid run payload', exitKind: 'spawn_error' as const }
    }
    if (activeRsa) {
      return { ok: false, error: 'A command is already running. Stop it first.' }
    }
    rsaUserStopRequested = false
    const rawExe = payload.autoRsaExecutable
    const launch = resolveBotLaunch(rawExe ?? '', projectRoot(), process.platform)
    if (launch == null) {
      return {
        ok: false,
        error: `auto_rsa_bot not found at:\n${rawExe.trim() || '(empty)'}\n\nInstall the venv (${join(projectRoot(), 'python', 'setup.ps1')}).`
      }
    }
    const cwd = resolveCwdForRun(payload.cwd, projectRoot(), defaultDataDir())
    ensureEnvDir(cwd, projectRoot())

    return await new Promise<{
      ok: boolean
      code: number
      error?: string
      exitKind?: 'normal' | 'timeout' | 'spawn_error' | 'user_stopped' | 'signal'
    }>((resolveRun) => {
      const env = {
        ...process.env,
        DANGER_MODE: 'true',
        PYTHONUNBUFFERED: '1'
      } as NodeJS.ProcessEnv

      const spawnArgs = [...launch.prependArgs, ...payload.args]
      const winCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(launch.command)
      const child = spawn(launch.command, spawnArgs, {
        cwd,
        env,
        shell: winCmd,
        windowsHide: true,
        detached: process.platform !== 'win32'
      })
      activeRsa = child
      const timeoutMs = payload.timeoutMs
      let timedOut = false
      let settled = false
      let timer: ReturnType<typeof setTimeout> | null = null
      if (timeoutMs != null && timeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true
          killProcessTree(child)
        }, timeoutMs)
      }

      const send = (chunk: Buffer) => {
        mainWindow?.webContents.send('rsa:log', chunk.toString())
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
        resolveRun(result)
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
  })

  ipcMain.handle('rsa:stop', () => {
    if (activeRsa) {
      rsaUserStopRequested = true
      killProcessTree(activeRsa)
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

  ipcMain.handle('fs:pathStatus', (_e, payload: unknown) => {
    if (!validatePathPayload(payload)) {
      return {
        envDirExists: false,
        envFileExists: false,
        exeExists: false,
        botResolvedSummary: null,
        botSetupHint: 'Invalid payload'
      }
    }
    const dir = payload.envDirectory?.trim() ?? ''
    const exe = payload.autoRsaExecutable?.trim() ?? ''
    const dirResolved = dir.length > 0 ? firstExistingEnvDir(dir, projectRoot()) : null
    const pr = projectRoot()
    const launch = resolveBotLaunch(exe, pr, process.platform)
    return {
      envDirExists: dirResolved != null,
      envFileExists: dirResolved != null && existsSync(join(dirResolved, '.env')),
      exeExists: launch != null,
      botResolvedSummary: launch
        ? launch.kind === 'python_module'
          ? `Runs with: ${basename(launch.command)} -m auto_rsa_bot`
          : `Runs with: ${basename(launch.command)}`
        : null,
      botSetupHint: launch ? null : explainBotLaunchFailure(exe, pr, process.platform)
    }
  })

  ipcMain.handle('fs:envSummary', (_e, payload: unknown) => {
    const p = payload as { envDirectory?: string }
    const cwd = resolveCwdForRun(p?.envDirectory ?? '', projectRoot(), defaultDataDir())
    const keys = parseEnvKeys(cwd)
    return { cwd, keys }
  })

  ipcMain.handle('env:read', (_e, payload: unknown) => {
    const p = payload as { envDirectory?: string }
    const cwd = resolveCwdForRun(p?.envDirectory ?? '', projectRoot(), defaultDataDir())
    const raw = readEnvFile(cwd)
    return { cwd, raw, masked: maskEnvForDisplay(raw) }
  })

  ipcMain.handle('env:write', (_e, payload: unknown) => {
    if (!validateEnvWritePayload(payload)) return { ok: false, error: 'Invalid payload' }
    const cwd = resolveCwdForRun(payload.envDirectory, projectRoot(), defaultDataDir())
    return writeEnvFile(cwd, payload.content)
  })

  ipcMain.handle('env:doctor', () => envDoctorReport(projectRoot()))
  ipcMain.handle('env:doctorFix', () => runEnvDoctorFix(projectRoot()))
  ipcMain.handle('env:versionStatus', () => autoRsaVersionStatus(projectRoot()))
  ipcMain.handle('env:upgrade', () => runAutoRsaUpgrade(projectRoot()))

  ipcMain.handle('audit:appendLive', (_e, entry: unknown) => {
    const e = entry as Record<string, unknown>
    if (typeof e.taskName !== 'string' || typeof e.commandLine !== 'string') {
      return { ok: false }
    }
    appendLiveRunAudit({
      taskName: e.taskName,
      mode: String(e.mode ?? ''),
      commandLine: e.commandLine,
      cwd: String(e.cwd ?? ''),
      ok: Boolean(e.ok),
      code: Number(e.code ?? -1)
    })
    return { ok: true }
  })

  ipcMain.handle('notify:show', (_e, payload: unknown) => {
    const p = payload as { title?: string; body?: string }
    if (!Notification.isSupported()) return { ok: false }
    new Notification({
      title: p.title ?? 'AutoRSA',
      body: p.body ?? ''
    }).show()
    return { ok: true }
  })

  ipcMain.handle('app:checkUpdates', async () => {
    if (!app.isPackaged) {
      return { ok: false, detail: 'Updates only apply to packaged builds.' }
    }
    try {
      autoUpdater.checkForUpdatesAndNotify()
      return { ok: true, detail: 'Checking for updates…' }
    } catch (e) {
      return { ok: false, detail: e instanceof Error ? e.message : String(e) }
    }
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    setApplicationMenu()
    registerIpc()
    createWindow()

    startSchedulePoller(
      () => cachedStore?.scheduledJobs ?? [],
      () => mainWindow,
      (jobId) => {
        mainWindow?.webContents.send('schedule:due', jobId)
      }
    )

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    stopSchedulePoller()
    if (process.platform !== 'darwin') app.quit()
  })
}

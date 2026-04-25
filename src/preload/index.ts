import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  storeLoad: () => ipcRenderer.invoke('store:load'),
  storeSave: (s: unknown) => ipcRenderer.invoke('store:save', s),
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory'),
  pickExecutable: () => ipcRenderer.invoke('dialog:pickExecutable'),
  openPath: (p: string) => ipcRenderer.invoke('shell:openPath', p),
  openExternal: (u: string) => ipcRenderer.invoke('shell:openExternal', u),
  rsaRun: (p: {
    args: string[]
    cwd: string
    autoRsaExecutable: string
    timeoutMs?: number
  }) => ipcRenderer.invoke('rsa:run', p),
  rsaStop: () => ipcRenderer.invoke('rsa:stop'),
  onRsaLog: (cb: (t: string) => void) => {
    const fn = (_: unknown, t: string) => cb(t)
    ipcRenderer.on('rsa:log', fn)
    return () => ipcRenderer.removeListener('rsa:log', fn)
  },
  getPaths: () =>
    ipcRenderer.invoke('app:getPaths') as Promise<{
      userData: string
      projectRoot: string
      platform: NodeJS.Platform
      pythonVenvScripts: string
      pythonVenvBin: string
    }>,
  pathStatus: (p: { envDirectory: string; autoRsaExecutable: string }) =>
    ipcRenderer.invoke('fs:pathStatus', p) as Promise<{
      envDirExists: boolean
      envFileExists: boolean
      exeExists: boolean
      botResolvedSummary: string | null
      botSetupHint: string | null
    }>,
  envSummary: (p: { envDirectory: string }) =>
    ipcRenderer.invoke('fs:envSummary', p) as Promise<{ cwd: string; keys: string[] }>,
  envDoctor: () =>
    ipcRenderer.invoke('env:doctor') as Promise<{
      ok: boolean
      checks: Array<{ label: string; ok: boolean; detail: string }>
      fixCommand: string
    }>,
  envDoctorFix: () =>
    ipcRenderer.invoke('env:doctorFix') as Promise<{ ok: boolean; output: string }>,
  envVersionStatus: () =>
    ipcRenderer.invoke('env:versionStatus') as Promise<{
      installedVersion: string | null
      latestKnownVersion: string
      upToDate: boolean | null
      detail: string
    }>,
  setWindowTitle: (title: string) => ipcRenderer.invoke('app:setWindowTitle', title)
})

import { contextBridge, ipcRenderer } from 'electron'
import type { EnvDoctorReport, RsaRunResult, Store, VersionStatus } from '../shared/types'

contextBridge.exposeInMainWorld('api', {
  storeLoad: () => ipcRenderer.invoke('store:load') as Promise<Store>,
  storeSave: (s: Store) =>
    ipcRenderer.invoke('store:save', s) as Promise<{ ok: boolean; error?: string }>,
  pickDirectory: () => ipcRenderer.invoke('dialog:pickDirectory') as Promise<string | null>,
  pickExecutable: () => ipcRenderer.invoke('dialog:pickExecutable') as Promise<string | null>,
  saveLogFile: (p: { content: string; suggestedName?: string }) =>
    ipcRenderer.invoke('dialog:saveFile', p) as Promise<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }>,
  openPath: (p: string) => ipcRenderer.invoke('shell:openPath', p),
  openExternal: (u: string) => ipcRenderer.invoke('shell:openExternal', u),
  rsaRun: (p: {
    args: string[]
    cwd: string
    autoRsaExecutable: string
    timeoutMs?: number
  }) => ipcRenderer.invoke('rsa:run', p) as Promise<RsaRunResult>,
  rsaStop: () => ipcRenderer.invoke('rsa:stop'),
  onRsaLog: (cb: (t: string) => void) => {
    const fn = (_: unknown, t: string) => cb(t)
    ipcRenderer.on('rsa:log', fn)
    return () => ipcRenderer.removeListener('rsa:log', fn)
  },
  onScheduleDue: (cb: (jobId: string) => void) => {
    const fn = (_: unknown, jobId: string) => cb(jobId)
    ipcRenderer.on('schedule:due', fn)
    return () => ipcRenderer.removeListener('schedule:due', fn)
  },
  getPaths: () =>
    ipcRenderer.invoke('app:getPaths') as Promise<{
      userData: string
      projectRoot: string
      platform: string
      pythonVenvScripts: string
      pythonVenvBin: string
    }>,
  pathStatus: (p: { envDirectory: string; autoRsaExecutable: string }) =>
    ipcRenderer.invoke('fs:pathStatus', p),
  envSummary: (p: { envDirectory: string }) => ipcRenderer.invoke('fs:envSummary', p),
  envRead: (p: { envDirectory: string }) =>
    ipcRenderer.invoke('env:read', p) as Promise<{ cwd: string; raw: string; masked: string }>,
  envWrite: (p: { envDirectory: string; content: string }) =>
    ipcRenderer.invoke('env:write', p) as Promise<{ ok: boolean; error?: string }>,
  envDoctor: () => ipcRenderer.invoke('env:doctor') as Promise<EnvDoctorReport>,
  envDoctorFix: () => ipcRenderer.invoke('env:doctorFix') as Promise<{ ok: boolean; output: string }>,
  envVersionStatus: () => ipcRenderer.invoke('env:versionStatus') as Promise<VersionStatus>,
  envUpgrade: () => ipcRenderer.invoke('env:upgrade') as Promise<{ ok: boolean; output: string }>,
  auditAppendLive: (entry: {
    taskName: string
    mode: string
    commandLine: string
    cwd: string
    ok: boolean
    code: number
  }) => ipcRenderer.invoke('audit:appendLive', entry),
  notifyShow: (p: { title?: string; body?: string }) => ipcRenderer.invoke('notify:show', p),
  checkUpdates: () => ipcRenderer.invoke('app:checkUpdates') as Promise<{ ok: boolean; detail: string }>,
  setWindowTitle: (title: string) => ipcRenderer.invoke('app:setWindowTitle', title)
})

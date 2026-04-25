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
  getPaths: () => ipcRenderer.invoke('app:getPaths') as Promise<{
    userData: string
    projectRoot: string
  }>
})

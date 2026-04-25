/// <reference types="vite/client" />

import type { Store } from './types'

type Api = {
  storeLoad: () => Promise<Store>
  storeSave: (s: Store) => Promise<void>
  pickDirectory: () => Promise<string | null>
  pickExecutable: () => Promise<string | null>
  openPath: (p: string) => Promise<void>
  openExternal: (u: string) => Promise<void>
  rsaRun: (p: {
    args: string[]
    cwd: string
    autoRsaExecutable: string
    timeoutMs?: number
  }) => Promise<{
    ok: boolean
    code: number
    error?: string
  }>
  rsaStop: () => Promise<void>
  onRsaLog: (cb: (t: string) => void) => () => void
  getPaths: () => Promise<{ userData: string; projectRoot: string }>
}

declare global {
  interface Window {
    api: Api
  }
}

export {}

/// <reference types="vite/client" />

import type { RsaRunResult, Store } from './types'

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
  getPaths: () => Promise<{
    userData: string
    projectRoot: string
    platform: string
    pythonVenvScripts: string
    pythonVenvBin: string
  }>
  pathStatus: (p: { envDirectory: string; autoRsaExecutable: string }) => Promise<{
    envDirExists: boolean
    envFileExists: boolean
    exeExists: boolean
    botResolvedSummary: string | null
    botSetupHint: string | null
  }>
  envSummary: (p: { envDirectory: string }) => Promise<{ cwd: string; keys: string[] }>
  envDoctor: () => Promise<{
    ok: boolean
    checks: Array<{ label: string; ok: boolean; detail: string }>
    fixCommand: string
  }>
  envDoctorFix: () => Promise<{ ok: boolean; output: string }>
  envVersionStatus: () => Promise<{
    installedVersion: string | null
    latestKnownVersion: string
    upToDate: boolean | null
    detail: string
  }>
  setWindowTitle: (title: string) => Promise<void>
}

declare global {
  interface Window {
    api: Api
  }
}

export {}

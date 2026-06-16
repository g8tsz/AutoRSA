/// <reference types="vite/client" />

import type { EnvDoctorReport, RsaRunResult, Store, VersionStatus } from '../../shared/types'

declare global {
  interface Window {
    api: {
      storeLoad: () => Promise<Store>
      storeSave: (s: Store) => Promise<{ ok: boolean; error?: string }>
      pickDirectory: () => Promise<string | null>
      pickExecutable: () => Promise<string | null>
      saveLogFile: (p: {
        content: string
        suggestedName?: string
      }) => Promise<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }>
      openPath: (p: string) => Promise<void>
      openExternal: (u: string) => Promise<void>
      rsaRun: (p: {
        args: string[]
        cwd: string
        autoRsaExecutable: string
        timeoutMs?: number
      }) => Promise<RsaRunResult>
      rsaStop: () => Promise<void>
      onRsaLog: (cb: (t: string) => void) => () => void
      onScheduleDue?: (cb: (jobId: string) => void) => () => void
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
      envRead: (p: { envDirectory: string }) => Promise<{ cwd: string; raw: string; masked: string }>
      envWrite: (p: { envDirectory: string; content: string }) => Promise<{ ok: boolean; error?: string }>
      envDoctor: () => Promise<EnvDoctorReport>
      envDoctorFix: () => Promise<{ ok: boolean; output: string }>
      envVersionStatus: () => Promise<VersionStatus>
      envUpgrade: () => Promise<{ ok: boolean; output: string }>
      auditAppendLive: (entry: {
        taskName: string
        mode: string
        commandLine: string
        cwd: string
        ok: boolean
        code: number
      }) => Promise<{ ok: boolean }>
      notifyShow: (p: { title?: string; body?: string }) => Promise<{ ok: boolean }>
      checkUpdates: () => Promise<{ ok: boolean; detail: string }>
      setWindowTitle: (title: string) => Promise<void>
    }
  }
}

export {}

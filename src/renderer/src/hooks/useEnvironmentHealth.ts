import { useEffect, useState } from 'react'
import type { AppSettings } from '../types'

export type PathStatus = {
  envDirExists: boolean
  envFileExists: boolean
  exeExists: boolean
  botResolvedSummary: string | null
  botSetupHint: string | null
}

/**
 * Checks env dir, .env, and auto_rsa_bot on disk. Polls every 4s; refreshes when paths change.
 */
export function useEnvironmentHealth(settings: AppSettings | null): PathStatus | null {
  const [s, setS] = useState<PathStatus | null>(null)

  useEffect(() => {
    if (!settings) {
      setS(null)
      return
    }
    let cancelled = false
    const run = () => {
      void window.api
        .pathStatus({
          envDirectory: settings.envDirectory,
          autoRsaExecutable: settings.autoRsaExecutable
        })
        .then((r) => {
          if (!cancelled) {
            setS({
              envDirExists: r.envDirExists,
              envFileExists: r.envFileExists,
              exeExists: r.exeExists,
              botResolvedSummary: r.botResolvedSummary ?? null,
              botSetupHint: r.botSetupHint ?? null
            })
          }
        })
    }
    run()
    const id = setInterval(run, 4000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [settings?.envDirectory, settings?.autoRsaExecutable])

  return s
}

export function isReadyToRun(h: PathStatus | null): h is PathStatus {
  return h != null && h.envDirExists && h.exeExists
}

export function healthLevel(
  h: PathStatus | null
): 'loading' | 'ok' | 'warn' | 'error' {
  if (h == null) return 'loading'
  if (!h.envDirExists || !h.exeExists) return 'error'
  if (!h.envFileExists) return 'warn'
  return 'ok'
}

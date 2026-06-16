import { appendFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'

export function auditLogPath(): string {
  return join(app.getPath('userData'), 'live-runs-audit.log')
}

/** Append-only audit trail for live (non-dry) command runs. */
export function appendLiveRunAudit(entry: {
  taskName: string
  mode: string
  commandLine: string
  cwd: string
  ok: boolean
  code: number
}): void {
  const p = auditLogPath()
  mkdirSync(dirname(p), { recursive: true })
  const line = JSON.stringify({
    at: new Date().toISOString(),
    ...entry
  })
  appendFileSync(p, line + '\n', 'utf-8')
}

export function auditLogExists(): boolean {
  return existsSync(auditLogPath())
}

import type { Store } from '../shared/types'

/** Basic structural validation for IPC store payloads. */
export function validateStorePayload(raw: unknown): raw is Store {
  if (raw == null || typeof raw !== 'object') return false
  const s = raw as Store
  if (!s.settings || typeof s.settings !== 'object') return false
  if (!Array.isArray(s.groups) || !Array.isArray(s.tasks)) return false
  if (typeof s.settings.envDirectory !== 'string') return false
  if (typeof s.settings.autoRsaExecutable !== 'string') return false
  for (const t of s.tasks) {
    if (typeof t.id !== 'string' || typeof t.name !== 'string') return false
    if (t.mode !== 'buy' && t.mode !== 'sell' && t.mode !== 'holdings') return false
  }
  return true
}

export function validateRunPayload(raw: unknown): raw is {
  args: string[]
  cwd: string
  autoRsaExecutable: string
  timeoutMs?: number
} {
  if (raw == null || typeof raw !== 'object') return false
  const p = raw as Record<string, unknown>
  if (!Array.isArray(p.args) || !p.args.every((a) => typeof a === 'string')) return false
  if (typeof p.cwd !== 'string' || typeof p.autoRsaExecutable !== 'string') return false
  if (p.timeoutMs != null && (typeof p.timeoutMs !== 'number' || p.timeoutMs < 0)) return false
  return true
}

export function validatePathPayload(raw: unknown): raw is { envDirectory: string; autoRsaExecutable: string } {
  if (raw == null || typeof raw !== 'object') return false
  const p = raw as Record<string, unknown>
  return typeof p.envDirectory === 'string' && typeof p.autoRsaExecutable === 'string'
}

export function validateEnvWritePayload(raw: unknown): raw is { envDirectory: string; content: string } {
  if (raw == null || typeof raw !== 'object') return false
  const p = raw as Record<string, unknown>
  return typeof p.envDirectory === 'string' && typeof p.content === 'string'
}

export function validateSaveLogPayload(raw: unknown): raw is { content: string; suggestedName?: string } {
  if (raw == null || typeof raw !== 'object') return false
  const p = raw as Record<string, unknown>
  if (typeof p.content !== 'string') return false
  if (p.suggestedName != null && typeof p.suggestedName !== 'string') return false
  return true
}

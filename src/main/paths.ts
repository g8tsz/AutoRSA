import { existsSync, statSync } from 'node:fs'
import { isAbsolute, join, normalize, resolve } from 'node:path'

export function isExistingDirectory(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory()
  } catch {
    return false
  }
}

export function firstExistingEnvDir(raw: string, projectRoot: string): string | null {
  const t = (raw ?? '').trim()
  if (!t) return null
  const candidates: string[] = []
  candidates.push(resolve(t))
  if (!isAbsolute(t)) {
    candidates.push(resolve(join(projectRoot, t)))
    candidates.push(resolve(join(projectRoot, t.replace(/^[/\\]+/, ''))))
  }
  const seen = new Set<string>()
  for (const c of candidates) {
    const key = normalize(c).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (isExistingDirectory(c)) return normalize(c)
  }
  return null
}

export function resolveCwdForRun(raw: string, projectRoot: string, defaultDataDir: string): string {
  const t = (raw ?? '').trim()
  if (!t) return defaultDataDir
  const found = firstExistingEnvDir(t, projectRoot)
  if (found) return found
  const r = resolve(t)
  if (!isAbsolute(t)) {
    return normalize(resolve(join(projectRoot, t.replace(/^[/\\]+/, ''))))
  }
  return normalize(r)
}

export function canonicalizeEnvDirectory(settings: { envDirectory: string }, projectRoot: string, defaultDataDir: string): void {
  const raw = settings.envDirectory?.trim() ?? ''
  if (!raw) {
    settings.envDirectory = defaultDataDir
    return
  }
  const found = firstExistingEnvDir(raw, projectRoot)
  if (found) {
    settings.envDirectory = found
  }
}

import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, resolve } from 'node:path'

export function isRunnableFile(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isFile()
  } catch {
    return false
  }
}

function isDir(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** Windows: exact path; if extension omitted, try .exe / .cmd / .bat; if .exe missing, try .cmd/.bat same stem. */
export function tryWindowsRunnable(base: string, win: boolean): string | null {
  const n = normalize(base)
  if (isRunnableFile(n)) return n
  if (!win) return null
  if (!/\.(exe|cmd|bat|com)$/i.test(n)) {
    for (const ext of ['.exe', '.cmd', '.bat']) {
      const p = n + ext
      if (isRunnableFile(p)) return p
    }
    return null
  }
  if (/\.exe$/i.test(n)) {
    const cmd = n.replace(/\.exe$/i, '.cmd')
    if (isRunnableFile(cmd)) return cmd
    const bat = n.replace(/\.exe$/i, '.bat')
    if (isRunnableFile(bat)) return bat
  }
  return null
}

/** Paths to try as a direct console entrypoint (auto_rsa_bot / .exe / .cmd). */
export function candidateExecutablePaths(raw: string, projectRoot: string): string[] {
  const t = (raw ?? '').trim()
  const roots: string[] = []
  if (t.length > 0) {
    roots.push(resolve(t))
    if (!isAbsolute(t)) {
      roots.push(resolve(join(projectRoot, t)))
      roots.push(resolve(join(projectRoot, t.replace(/^[/\\]+/, ''))))
    }
  }
  roots.push(join(projectRoot, 'python', 'venv', 'Scripts', 'auto_rsa_bot.exe'))
  roots.push(join(projectRoot, 'python', 'venv', 'Scripts', 'auto_rsa_bot'))
  roots.push(join(projectRoot, 'python', 'venv', 'bin', 'auto_rsa_bot'))
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of roots) {
    const key = normalize(r).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

export function resolveDirectBotExecutable(
  raw: string,
  projectRoot: string,
  platform: NodeJS.Platform
): string | null {
  const win = platform === 'win32'
  for (const r of candidateExecutablePaths(raw, projectRoot)) {
    const found = tryWindowsRunnable(r, win)
    if (found) return found
  }
  return null
}

/** Scripts / bin dirs to inspect for `python -m auto_rsa_bot`. */
export function collectScriptsDirs(raw: string, projectRoot: string): string[] {
  const dirs = new Set<string>()
  const add = (d: string) => {
    const n = normalize(d)
    if (n.length > 0) dirs.add(n)
  }
  for (const r of candidateExecutablePaths(raw, projectRoot)) {
    add(dirname(r))
  }
  add(join(projectRoot, 'python', 'venv', 'Scripts'))
  add(join(projectRoot, 'python', 'venv', 'bin'))
  return [...dirs]
}

function hasAutoRsaDistInfo(sitePackages: string): boolean {
  try {
    return readdirSync(sitePackages).some(
      (f) => f.endsWith('.dist-info') && /^auto_rsa_bot-/i.test(f)
    )
  } catch {
    return false
  }
}

function packageDirLooksUsable(pkgDir: string): boolean {
  if (!isDir(pkgDir)) return false
  const mainPy = join(pkgDir, '__main__.py')
  const initPy = join(pkgDir, '__init__.py')
  if (isRunnableFile(mainPy) || isRunnableFile(initPy)) return true
  try {
    const entries = readdirSync(pkgDir).filter(
      (n) => n !== '__pycache__' && !n.endsWith('.pyc') && n !== '.DS_Store'
    )
    return entries.length > 0
  } catch {
    return false
  }
}

/** True if `python -m auto_rsa_bot` is likely to work for this venv. */
export function isAutoRsaPackageInVenv(venvRoot: string): boolean {
  const root = resolve(venvRoot)
  const sitePackages: string[] = []
  const winSp = join(root, 'Lib', 'site-packages')
  if (isDir(winSp)) sitePackages.push(winSp)
  const lib = join(root, 'lib')
  if (isDir(lib)) {
    try {
      for (const name of readdirSync(lib)) {
        if (!/^python\d+\.\d+$/.test(name)) continue
        const sp = join(lib, name, 'site-packages')
        if (isDir(sp)) sitePackages.push(sp)
      }
    } catch {
      /* ignore */
    }
  }
  for (const sp of sitePackages) {
    try {
      if (hasAutoRsaDistInfo(sp) && packageDirLooksUsable(join(sp, 'auto_rsa_bot'))) return true
      const mainPy = join(sp, 'auto_rsa_bot', '__main__.py')
      const initPy = join(sp, 'auto_rsa_bot', '__init__.py')
      if (isRunnableFile(mainPy) || isRunnableFile(initPy)) return true
    } catch {
      /* ignore */
    }
  }
  return false
}

export type BotLaunch = {
  command: string
  prependArgs: string[]
  kind: 'console' | 'python_module'
}

/**
 * Resolve how to run the bot: direct console script, or `python -m auto_rsa_bot`
 * from a venv whose Scripts/bin directory we inferred from settings + project layout.
 */
export function resolveBotLaunch(
  raw: string,
  projectRoot: string,
  platform: NodeJS.Platform
): BotLaunch | null {
  const direct = resolveDirectBotExecutable(raw, projectRoot, platform)
  if (direct) return { command: direct, prependArgs: [], kind: 'console' }

  const win = platform === 'win32'
  for (const scriptsDir of collectScriptsDirs(raw, projectRoot)) {
    if (!isDir(scriptsDir)) continue
    const py = win ? join(scriptsDir, 'python.exe') : join(scriptsDir, 'python')
    if (!isRunnableFile(py)) continue
    const venvRoot = resolve(join(scriptsDir, '..'))
    if (!isAutoRsaPackageInVenv(venvRoot)) continue
    return { command: py, prependArgs: ['-m', 'auto_rsa_bot'], kind: 'python_module' }
  }
  return null
}

/** One-line hint when the CLI cannot be launched (for Settings UI). */
export function explainBotLaunchFailure(
  raw: string,
  projectRoot: string,
  platform: NodeJS.Platform
): string {
  const venvRoot = join(projectRoot, 'python', 'venv')
  const scripts =
    platform === 'win32' ? join(venvRoot, 'Scripts') : join(venvRoot, 'bin')
  if (!isDir(venvRoot)) {
    return 'There is no python\\venv yet. Double-click python\\setup.bat in the app folder, or run: powershell -ExecutionPolicy Bypass -File .\\python\\setup.ps1'
  }
  if (!isDir(scripts)) {
    return 'python\\venv exists but Scripts (or bin) is missing — delete python\\venv and run python\\setup.ps1 again.'
  }
  const py = platform === 'win32' ? join(scripts, 'python.exe') : join(scripts, 'python')
  if (!isRunnableFile(py)) {
    return 'The venv has no python.exe (or python) in Scripts — recreate the venv with python\\setup.ps1.'
  }
  if (!isAutoRsaPackageInVenv(resolve(scripts, '..'))) {
    return 'Python is in the venv but auto_rsa_bot is not installed there. Run python\\setup.ps1 or: pip install -r python\\requirements.txt'
  }
  return `The venv looks usable but "${raw.trim() || '(empty)'}" could not be started. In Settings → Browse, pick auto_rsa_bot.exe, auto_rsa_bot.cmd, or this venv’s python.exe.`
}

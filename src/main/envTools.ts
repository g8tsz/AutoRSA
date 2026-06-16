import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { FALLBACK_LATEST_AUTORSA } from '../shared/constants'
import type { EnvDoctorReport, VersionStatus } from '../shared/types'

export function venvPythonPath(projectRoot: string): string {
  const win = join(projectRoot, 'python', 'venv', 'Scripts', 'python.exe')
  if (existsSync(win)) return win
  return join(projectRoot, 'python', 'venv', 'bin', 'python')
}

export function envDoctorReport(projectRoot: string): EnvDoctorReport {
  const py = venvPythonPath(projectRoot)
  const checks: EnvDoctorReport['checks'] = []
  const pyExists = existsSync(py)
  checks.push({ label: 'Venv Python', ok: pyExists, detail: py })
  if (!pyExists) {
    return {
      ok: false,
      checks,
      fixCommand: `powershell -ExecutionPolicy Bypass -File "${join(projectRoot, 'python', 'setup.ps1')}"`
    }
  }
  const mods = ['auto_rsa_bot', 'pytz', 'playwright']
  for (const m of mods) {
    const r = spawnSync(
      py,
      ['-c', `import importlib.util; raise SystemExit(0 if importlib.util.find_spec("${m}") else 1)`],
      { stdio: 'pipe', windowsHide: true }
    )
    checks.push({
      label: `Python module: ${m}`,
      ok: r.status === 0,
      detail: r.status === 0 ? 'ok' : (r.stderr?.toString() || 'missing').trim()
    })
  }
  return {
    ok: checks.every((c) => c.ok),
    checks,
    fixCommand: `"${py}" -m pip install -r "${join(projectRoot, 'python', 'requirements.txt')}" && "${py}" -m playwright install`
  }
}

export function runEnvDoctorFix(projectRoot: string): { ok: boolean; output: string } {
  const py = venvPythonPath(projectRoot)
  if (!existsSync(py)) {
    return {
      ok: false,
      output: `Venv Python not found. Run: powershell -ExecutionPolicy Bypass -File "${join(projectRoot, 'python', 'setup.ps1')}"`
    }
  }
  const steps: Array<{ args: string[]; label: string }> = [
    { label: 'Upgrade pip', args: ['-m', 'pip', 'install', '-U', 'pip'] },
    {
      label: 'Install requirements',
      args: ['-m', 'pip', 'install', '-r', join(projectRoot, 'python', 'requirements.txt')]
    },
    { label: 'Install Playwright browsers', args: ['-m', 'playwright', 'install'] }
  ]
  let out = ''
  for (const s of steps) {
    out += `\n# ${s.label}\n`
    const r = spawnSync(py, s.args, { stdio: 'pipe', windowsHide: true })
    out += (r.stdout?.toString() ?? '') + (r.stderr?.toString() ?? '')
    if (r.status !== 0) {
      return { ok: false, output: out }
    }
  }
  return { ok: true, output: out }
}

export function installedAutoRsaVersion(projectRoot: string): string | null {
  const py = venvPythonPath(projectRoot)
  if (!existsSync(py)) return null
  const r = spawnSync(
    py,
    ['-c', "import importlib.metadata as m; print(m.version('auto_rsa_bot'))"],
    { stdio: 'pipe', windowsHide: true }
  )
  if (r.status !== 0) return null
  return (r.stdout?.toString() || '').trim() || null
}

/** Fetch latest auto_rsa_bot version from PyPI JSON API. */
export async function fetchLatestPyPiVersion(): Promise<string | null> {
  try {
    const res = await fetch('https://pypi.org/pypi/auto_rsa_bot/json', {
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) return null
    const data = (await res.json()) as { info?: { version?: string } }
    return data.info?.version ?? null
  } catch {
    return null
  }
}

export async function autoRsaVersionStatus(projectRoot: string): Promise<VersionStatus> {
  const py = venvPythonPath(projectRoot)
  if (!existsSync(py)) {
    return {
      installedVersion: null,
      latestKnownVersion: FALLBACK_LATEST_AUTORSA,
      upToDate: null,
      detail: 'Venv python missing.'
    }
  }
  const installed = installedAutoRsaVersion(projectRoot)
  const latest = (await fetchLatestPyPiVersion()) ?? FALLBACK_LATEST_AUTORSA
  if (installed == null) {
    return {
      installedVersion: null,
      latestKnownVersion: latest,
      upToDate: null,
      detail: 'auto_rsa_bot not installed'
    }
  }
  return {
    installedVersion: installed,
    latestKnownVersion: latest,
    upToDate: installed === latest,
    detail: 'ok'
  }
}

export function runAutoRsaUpgrade(projectRoot: string): { ok: boolean; output: string } {
  return runEnvDoctorFix(projectRoot)
}

export function parseEnvKeys(cwd: string): string[] {
  const p = join(cwd, '.env')
  if (!existsSync(p)) return []
  try {
    const raw = readFileSync(p, 'utf-8')
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#') && l.includes('='))
      .map((l) => l.split('=')[0]?.trim() ?? '')
      .filter((k) => k.length > 0)
  } catch {
    return []
  }
}

export function readEnvFile(cwd: string): string {
  const p = join(cwd, '.env')
  if (!existsSync(p)) return ''
  try {
    return readFileSync(p, 'utf-8')
  } catch {
    return ''
  }
}

export function writeEnvFile(cwd: string, content: string): { ok: boolean; error?: string } {
  try {
    mkdirSync(cwd, { recursive: true })
    writeFileSync(join(cwd, '.env'), content, 'utf-8')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function maskEnvForDisplay(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) return line
      const eq = line.indexOf('=')
      const key = line.slice(0, eq)
      const val = line.slice(eq + 1)
      if (val.length <= 4) return `${key}=****`
      return `${key}=${val.slice(0, 2)}****${val.slice(-2)}`
    })
    .join('\n')
}

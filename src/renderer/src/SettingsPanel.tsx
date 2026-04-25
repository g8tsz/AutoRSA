import { useEffect, useState } from 'react'
import type { AppSettings } from './types'
import { healthLevel, type PathStatus } from './hooks/useEnvironmentHealth'
import { BROKER_DOCS, UPSTREAM_RELEASES_URL } from './lib/brokerDocs'

type Props = {
  settings: AppSettings
  onChange: (s: AppSettings) => void
  pathStatus: PathStatus | null
  runStats: { ok: number; err: number }
}

function FieldOk({
  ok,
  label,
  detail
}: {
  ok: boolean
  label: string
  detail?: string | null
}): React.JSX.Element {
  const title =
    detail && detail.length > 0
      ? detail
      : ok
        ? `${label} verified on disk`
        : `${label} not found`
  return (
    <span
      className={
        'inline-flex items-center gap-1 text-[10px] ' + (ok ? 'text-emerald-400' : 'text-zinc-600')
      }
      title={title}
    >
      {ok ? '✓' : '○'} {label}
    </span>
  )
}

function configurationDetail(
  pathStatus: PathStatus | null,
  level: 'loading' | 'ok' | 'warn' | 'error'
): string {
  if (pathStatus == null || level === 'loading') {
    return 'Verifying working directory, .env, and auto_rsa_bot on disk…'
  }
  if (level === 'ok') {
    return 'Working directory, executable, and .env are present. You can run tasks.'
  }
  if (level === 'warn') {
    return 'Working directory and CLI are set, but there is no .env in that folder yet. Add one for broker credentials (or continue with dry runs).'
  }
  const parts: string[] = []
  if (!pathStatus.envDirExists) {
    parts.push(
      'The working directory path does not exist. Use Browse to pick a folder, or create the folder on disk first.'
    )
  }
  if (pathStatus.envDirExists && !pathStatus.envFileExists) {
    parts.push(
      'Add a .env in the working directory (the app can copy from .env.example when you first open a new folder in some cases).'
    )
  }
  if (!pathStatus.exeExists) {
    parts.push(
      pathStatus.botSetupHint ??
        'The CLI could not be started from the path in Settings. Install the Python venv (see below), then pick auto_rsa_bot.exe, auto_rsa_bot.cmd, or the venv’s python.exe with Browse.'
    )
  }
  return parts.length > 0 ? parts.join(' ') : 'Fix the issues indicated below.'
}

function SettingsCard({
  title,
  description,
  children
}: {
  title: string
  description?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="rounded-md border-2 border-surface-border bg-surface-raised p-4 shadow-sm transition-colors duration-200">
      <h2 className="text-sm font-semibold text-zinc-200">{title}</h2>
      {description && <p className="mt-1 text-[11px] text-zinc-500">{description}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  )
}

export function SettingsPanel({ settings, onChange, pathStatus, runStats }: Props): React.JSX.Element {
  const [paths, setPaths] = useState<{
    userData: string
    projectRoot: string
    platform: string
    pythonVenvScripts: string
    pythonVenvBin: string
  } | null>(null)
  useEffect(() => {
    void window.api.getPaths().then(setPaths)
  }, [])

  const level = healthLevel(pathStatus)
  const envOk = pathStatus?.envDirExists ?? false
  const envFileOk = pathStatus?.envFileExists ?? false
  const exeOk = pathStatus?.exeExists ?? false
  const [doctorReport, setDoctorReport] = useState<{
    ok: boolean
    checks: Array<{ label: string; ok: boolean; detail: string }>
    fixCommand: string
  } | null>(null)
  const [doctorOutput, setDoctorOutput] = useState('')
  const [doctorBusy, setDoctorBusy] = useState(false)
  const [versionStatus, setVersionStatus] = useState<{
    installedVersion: string | null
    latestKnownVersion: string
    upToDate: boolean | null
    detail: string
  } | null>(null)

  useEffect(() => {
    void window.api.envVersionStatus().then(setVersionStatus)
  }, [])

  return (
    <div className="space-y-4 pb-8 text-sm text-zinc-300">
      <p className="text-xs text-zinc-500">
        Two different folders matter: (1){' '}
        <strong className="text-zinc-400">Working directory</strong> — where the CLI runs and where
        your <code className="text-indigo-300">.env</code> with broker credentials lives (often under
        App data). (2){' '}
        <strong className="text-zinc-400">Python venv</strong> — lives next to this app under{' '}
        <code className="text-indigo-300">python\venv</code> and holds <code className="text-indigo-300">
          auto_rsa_bot
        </code>{' '}
        (Python 3.12+). Create it once by double-clicking <code className="text-indigo-300">
          python\setup.bat
        </code>{' '}
        or running <code className="text-indigo-300">python\setup.ps1</code> in PowerShell.
        See the{' '}
        <button
          type="button"
          className="text-indigo-400 underline hover:text-indigo-300"
          onClick={() => void window.api.openExternal('https://github.com/NelsonDane/auto-rsa')}
        >
          AutoRSA README
        </button>
        .
      </p>

      <div
        className={
          'rounded-md border-2 px-3 py-2.5 text-[12px] transition-colors duration-200 ' +
          (level === 'ok'
            ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200/90'
            : level === 'warn'
              ? 'border-amber-500/35 bg-amber-500/10 text-amber-100/90'
              : level === 'error'
                ? 'border-red-500/30 bg-red-500/5 text-red-200/90'
                : 'border-surface-border bg-zinc-900/50 text-zinc-400')
        }
      >
        <div className="font-medium">Configuration status</div>
        <p className="mt-1 text-[11px] text-zinc-500">
          {configurationDetail(pathStatus, level)}
        </p>
        {pathStatus && (
          <div className="mt-2 flex flex-wrap gap-3">
            <FieldOk ok={envOk} label="Working dir" />
            <FieldOk ok={envFileOk} label=".env file" />
            <FieldOk
              ok={exeOk}
              label="auto_rsa_bot"
              detail={exeOk ? pathStatus.botResolvedSummary : pathStatus.botSetupHint}
            />
          </div>
        )}
      </div>

      <p className="text-xs text-amber-200/80">
        This app spawns the CLI with <code className="text-amber-100">DANGER_MODE=true</code> so the
        Python process does not wait for a second terminal confirmation. Rely on{' '}
        <strong>dry run</strong> and the confirmation dialogs here before live orders.
      </p>

      <SettingsCard
        title="Safety & automation"
        description="Global dry mode and optional retries. Local counters stay on this machine only."
      >
        <label className="flex cursor-pointer items-start gap-2 text-zinc-300">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={settings.forceDryRun}
            onChange={(e) => onChange({ ...settings, forceDryRun: e.target.checked })}
          />
          <span>
            <span className="text-sm">Force all runs to be dry (paper / test)</span>
            <span className="mt-0.5 block text-[11px] text-zinc-500">
              Buy and sell tasks use dry mode regardless of the per-task toggle; no live order prompts.
            </span>
          </span>
        </label>
        <div>
          <label className="flex cursor-pointer items-start gap-2 text-zinc-300">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={settings.retryOnFailure.enabled}
              onChange={(e) =>
                onChange({
                  ...settings,
                  retryOnFailure: { ...settings.retryOnFailure, enabled: e.target.checked }
                })
              }
            />
            <span className="text-sm">Retry failed task runs (same task)</span>
          </label>
          {settings.retryOnFailure.enabled && (
            <div className="ml-6 mt-2">
              <div className="text-[11px] text-zinc-500">Max attempts (including the first run)</div>
              <input
                type="number"
                min={1}
                max={20}
                className="mt-0.5 w-24 rounded border border-surface-border bg-[#0c0c0e] px-2 py-1 font-mono text-xs"
                value={settings.retryOnFailure.maxAttempts}
                onChange={(e) => {
                  const n = Math.max(1, Math.min(20, Math.floor(Number(e.target.value) || 1)))
                  onChange({ ...settings, retryOnFailure: { ...settings.retryOnFailure, maxAttempts: n } })
                }}
              />
            </div>
          )}
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-zinc-300">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={settings.telemetryLocalEnabled}
            onChange={(e) => onChange({ ...settings, telemetryLocalEnabled: e.target.checked })}
          />
          <span>
            <span className="text-sm">Track run outcomes locally (no network)</span>
            <span className="mt-0.5 block text-[11px] text-zinc-500">
              Increments success/fail counters in your store file when enabled.
            </span>
          </span>
        </label>
        {settings.telemetryLocalEnabled && (
          <p className="text-[11px] text-zinc-500">
            This session (saved): {runStats.ok} ok / {runStats.err} failed
          </p>
        )}
        <div className="rounded border border-surface-border bg-[#0c0c0e] p-2">
          <label className="flex cursor-pointer items-start gap-2 text-zinc-300">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={settings.riskGuard.enabled}
              onChange={(e) =>
                onChange({
                  ...settings,
                  riskGuard: { ...settings.riskGuard, enabled: e.target.checked }
                })
              }
            />
            <span className="text-sm">Block oversized live buy/sell orders</span>
          </label>
          {settings.riskGuard.enabled && (
            <div className="ml-6 mt-2">
              <div className="text-[11px] text-zinc-500">Max shares per live order</div>
              <input
                type="number"
                min={1}
                className="mt-0.5 w-24 rounded border border-surface-border bg-[#0c0c0e] px-2 py-1 font-mono text-xs"
                value={settings.riskGuard.maxSharesPerOrder}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    riskGuard: {
                      ...settings.riskGuard,
                      maxSharesPerOrder: Math.max(1, Math.floor(Number(e.target.value) || 1))
                    }
                  })
                }
              />
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Broker Profile (for tasks using all)"
        description="Use this to keep tasks at 'all' but run only your chosen broker subset by default."
      >
        <label className="flex cursor-pointer items-start gap-2 text-zinc-300">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={settings.brokerProfile.applyToAllKeyword}
            onChange={(e) =>
              onChange({
                ...settings,
                brokerProfile: { ...settings.brokerProfile, applyToAllKeyword: e.target.checked }
              })
            }
          />
          <span className="text-sm">Apply this profile when task brokers = all</span>
        </label>
        <div>
          <div className="text-[11px] text-zinc-500">Include brokers (all or comma list)</div>
          <input
            className="mt-0.5 w-full rounded border border-surface-border bg-[#0c0c0e] px-2 py-1.5 font-mono text-xs"
            value={settings.brokerProfile.include}
            onChange={(e) =>
              onChange({
                ...settings,
                brokerProfile: { ...settings.brokerProfile, include: e.target.value }
              })
            }
          />
        </div>
        <div>
          <div className="text-[11px] text-zinc-500">Exclude brokers (comma list)</div>
          <input
            className="mt-0.5 w-full rounded border border-surface-border bg-[#0c0c0e] px-2 py-1.5 font-mono text-xs"
            value={settings.brokerProfile.exclude}
            onChange={(e) =>
              onChange({
                ...settings,
                brokerProfile: { ...settings.brokerProfile, exclude: e.target.value }
              })
            }
          />
        </div>
      </SettingsCard>

      <SettingsCard
        title="Paths & credentials"
        description="Working directory is cwd for each run (.env, creds/). The bot executable lives in the repo venv unless you override it below."
      >
        <div>
          <div className="text-[11px] text-zinc-500">.env directory (working directory for CLI)</div>
          <div className="mt-1 flex gap-2">
            <input
              readOnly
              className="min-w-0 flex-1 rounded border border-surface-border bg-[#0c0c0e] px-2 py-1.5 font-mono text-xs"
              value={settings.envDirectory}
            />
            <button
              type="button"
              className="shrink-0 rounded-md border border-surface-border bg-zinc-800 px-2 py-1 text-xs transition-colors hover:bg-zinc-700"
              onClick={async () => {
                const p = await window.api.pickDirectory()
                if (p) onChange({ ...settings, envDirectory: p })
              }}
            >
              Browse
            </button>
            <button
              type="button"
              className="shrink-0 rounded-md border border-surface-border bg-zinc-800 px-2 py-1 text-xs transition-colors hover:bg-zinc-700"
              onClick={() => void window.api.openPath(settings.envDirectory)}
            >
              Open
            </button>
          </div>
        </div>
        <div>
          <div className="text-[11px] text-zinc-500">
            auto_rsa_bot (console .exe/.cmd or venv <code className="text-indigo-300">python.exe</code> for{' '}
            <code className="text-indigo-300">-m</code>)
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            <input
              readOnly
              className="min-w-0 flex-1 rounded border border-surface-border bg-[#0c0c0e] px-2 py-1.5 font-mono text-xs"
              value={settings.autoRsaExecutable}
            />
            <button
              type="button"
              className="shrink-0 rounded-md border border-surface-border bg-zinc-800 px-2 py-1 text-xs transition-colors hover:bg-zinc-700"
              onClick={async () => {
                const p = await window.api.pickExecutable()
                if (p) onChange({ ...settings, autoRsaExecutable: p })
              }}
            >
              Browse
            </button>
            {paths && (
              <button
                type="button"
                className="shrink-0 rounded-md border border-surface-border bg-zinc-800 px-2 py-1 text-xs transition-colors hover:bg-zinc-700"
                onClick={() =>
                  void window.api.openPath(
                    paths.platform === 'win32' ? paths.pythonVenvScripts : paths.pythonVenvBin
                  )
                }
              >
                Open venv {paths.platform === 'win32' ? 'Scripts' : 'bin'}
              </button>
            )}
          </div>
          {pathStatus?.exeExists && pathStatus.botResolvedSummary && (
            <p className="mt-1.5 text-[11px] text-emerald-200/80">{pathStatus.botResolvedSummary}</p>
          )}
          {pathStatus && !pathStatus.exeExists && (
            <p className="mt-1.5 text-[11px] text-zinc-500">
              After <code className="text-indigo-300">python\setup.bat</code> or{' '}
              <code className="text-indigo-300">python\setup.ps1</code>, expect{' '}
              <code className="text-indigo-300">auto_rsa_bot.exe</code> or{' '}
              <code className="text-indigo-300">auto_rsa_bot.cmd</code> under{' '}
              <code className="text-indigo-300">python\venv\Scripts</code>
              {paths && (
                <>
                  {' '}
                  (app root:{' '}
                  <button
                    type="button"
                    className="text-indigo-400 underline hover:text-indigo-300"
                    onClick={() => void window.api.openPath(paths.projectRoot)}
                  >
                    open
                  </button>
                  )
                </>
              )}
            </p>
          )}
        </div>
      </SettingsCard>

      <SettingsCard
        title="Output & limits"
        description="Log panel size and automatic kill for hung broker scripts."
      >
        <div>
          <div className="text-[11px] text-zinc-500">Max log size (characters)</div>
          <input
            type="number"
            min={5_000}
            step={1_000}
            className="mt-0.5 w-full max-w-sm rounded border border-surface-border bg-[#0c0c0e] px-2 py-1.5 font-mono text-xs"
            value={settings.maxLogChars}
            onChange={(e) => {
              const n = Math.max(5_000, Math.floor(Number(e.target.value) || 0))
              onChange({ ...settings, maxLogChars: n })
            }}
          />
          <p className="mt-0.5 text-[11px] text-zinc-600">Older output is dropped from the top when full.</p>
        </div>
        <div>
          <div className="text-[11px] text-zinc-500">Command timeout (seconds, 0 = off)</div>
          <input
            type="number"
            min={0}
            step={30}
            className="mt-0.5 w-full max-w-sm rounded border border-surface-border bg-[#0c0c0e] px-2 py-1.5 font-mono text-xs"
            value={settings.commandTimeoutSec}
            onChange={(e) => {
              const n = Math.max(0, Math.floor(Number(e.target.value) || 0))
              onChange({ ...settings, commandTimeoutSec: n })
            }}
          />
          <p className="mt-0.5 text-[11px] text-zinc-600">
            Kills a stuck <code>auto_rsa_bot</code> after this time. Use 0 to disable, or 3600+ for
            long broker flows.
          </p>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Environment Doctor"
        description="Checks venv/python/module health and can run automatic fixes."
      >
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-surface-border bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
            onClick={async () => {
              setDoctorBusy(true)
              try {
                const r = await window.api.envDoctor()
                setDoctorReport(r)
              } finally {
                setDoctorBusy(false)
              }
            }}
            disabled={doctorBusy}
          >
            Run checks
          </button>
          <button
            type="button"
            className="rounded-md border border-surface-border bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
            onClick={async () => {
              setDoctorBusy(true)
              try {
                const r = await window.api.envDoctorFix()
                setDoctorOutput(r.output)
                const d = await window.api.envDoctor()
                setDoctorReport(d)
              } finally {
                setDoctorBusy(false)
              }
            }}
            disabled={doctorBusy}
          >
            Apply auto-fix
          </button>
        </div>
        {doctorReport && (
          <div className="rounded border border-surface-border bg-[#0c0c0e] p-2 text-xs">
            <div className={doctorReport.ok ? 'text-emerald-300' : 'text-amber-200'}>
              Overall: {doctorReport.ok ? 'healthy' : 'needs fixes'}
            </div>
            <ul className="mt-1 space-y-1 text-zinc-400">
              {doctorReport.checks.map((c) => (
                <li key={c.label}>
                  <span className={c.ok ? 'text-emerald-300' : 'text-red-300'}>{c.ok ? '✓' : '○'}</span>{' '}
                  {c.label} <span className="text-zinc-500">({c.detail})</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 text-[11px] text-zinc-500">Manual fix: {doctorReport.fixCommand}</div>
          </div>
        )}
        {doctorOutput && (
          <pre className="max-h-40 overflow-auto rounded border border-surface-border bg-[#0a0a0c] p-2 font-mono text-[10px] text-zinc-400">
            {doctorOutput}
          </pre>
        )}
      </SettingsCard>

      <SettingsCard
        title="Upstream compatibility"
        description="This desktop app uses the published auto_rsa_bot CLI contract (not upstream internal modules)."
      >
        <div className="text-xs text-zinc-400">
          CLI semantics supported: <code className="text-indigo-300">all</code>,{' '}
          <code className="text-indigo-300">day1</code>, <code className="text-indigo-300">most</code>,{' '}
          <code className="text-indigo-300">not</code>, and dry/live behavior.
        </div>
        {versionStatus && (
          <div className="rounded border border-surface-border bg-[#0c0c0e] p-2 text-xs">
            <div>
              Installed <code className="text-indigo-300">auto_rsa_bot</code>:{' '}
              <span className="text-zinc-200">{versionStatus.installedVersion ?? 'missing'}</span>
            </div>
            <div>
              Latest known validated: <span className="text-zinc-200">{versionStatus.latestKnownVersion}</span>
            </div>
            <div
              className={
                versionStatus.upToDate == null
                  ? 'text-amber-200'
                  : versionStatus.upToDate
                    ? 'text-emerald-300'
                    : 'text-amber-200'
              }
            >
              {versionStatus.upToDate == null
                ? `Version check warning: ${versionStatus.detail}`
                : versionStatus.upToDate
                  ? 'Version is up to date.'
                  : 'A newer validated upstream version exists. Consider updating via setup/doctor.'}
            </div>
          </div>
        )}
        <button
          type="button"
          className="w-fit rounded-md border border-surface-border bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700"
          onClick={() => void window.api.openExternal(UPSTREAM_RELEASES_URL)}
        >
          Open upstream releases/changelog
        </button>
      </SettingsCard>

      <SettingsCard
        title="Broker requirements helper"
        description="Required .env key + format for each broker, plus common caveats from upstream docs."
      >
        <div className="overflow-auto rounded border border-surface-border bg-[#0c0c0e]">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-[#111114] text-zinc-500">
              <tr>
                <th className="px-2 py-1">Broker</th>
                <th className="px-2 py-1">Env key</th>
                <th className="px-2 py-1">Example format</th>
                <th className="px-2 py-1">Notes</th>
              </tr>
            </thead>
            <tbody>
              {BROKER_DOCS.map((b) => (
                <tr key={b.slug} className="border-t border-surface-border/60">
                  <td className="px-2 py-1 lowercase text-zinc-300">{b.slug}</td>
                  <td className="px-2 py-1 font-mono text-indigo-300">{b.envVar}</td>
                  <td className="px-2 py-1 font-mono text-zinc-400">{b.example}</td>
                  <td className="px-2 py-1 text-zinc-500">
                    {b.caveat ?? '—'}
                    {b.guideUrl && (
                      <>
                        {' '}
                        <button
                          type="button"
                          className="text-indigo-400 underline hover:text-indigo-300"
                          onClick={() => void window.api.openExternal(b.guideUrl!)}
                        >
                          guide
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsCard>

      {paths && (
        <SettingsCard title="App data" description="For debugging and support.">
          <div className="text-[11px] text-zinc-500">
            <div>User data: {paths.userData}</div>
            <div className="mt-1">App root: {paths.projectRoot}</div>
          </div>
        </SettingsCard>
      )}
    </div>
  )
}

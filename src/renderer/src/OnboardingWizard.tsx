import type { AppSettings } from './types'

export function OnboardingWizard({
  settings,
  onPickEnvDir,
  onOpenProjectRoot,
  onDone
}: {
  settings: AppSettings
  onPickEnvDir: () => void
  onOpenProjectRoot: () => void
  onDone: () => void
}): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-lg rounded-md border-2 border-surface-border bg-surface-raised p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-100">Welcome to AutoRSA Desktop</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-zinc-300">
          <li>
            Choose a <strong className="text-zinc-200">working directory</strong> where your{' '}
            <code className="text-indigo-300">.env</code> and broker data live (often the app’s data
            folder is pre-filled). Use Browse, then open that folder in Explorer to add files if
            needed.
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md border border-surface-border bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200"
                onClick={onPickEnvDir}
              >
                Browse working directory
              </button>
              <button
                type="button"
                className="rounded-md border border-surface-border bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200"
                onClick={() => void window.api.openPath(settings.envDirectory)}
              >
                Open working directory
              </button>
              <button
                type="button"
                className="rounded-md border border-surface-border bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200"
                onClick={onOpenProjectRoot}
              >
                Open app folder (setup.bat / setup.ps1)
              </button>
            </div>
            <p className="mt-1 font-mono text-[10px] text-zinc-500">{settings.envDirectory}</p>
          </li>
          <li>
            Install the Python venv and <code className="text-indigo-300">auto_rsa_bot</code> using
            the project’s <code className="text-indigo-300">python\setup.bat</code> (double-click) or{' '}
            <code className="text-indigo-300">python\setup.ps1</code> in PowerShell. After that, set
            the executable in Settings if needed.
            <div className="mt-2">
              <span className="text-[11px] text-zinc-500">
                The wizard does not run scripts for you (security) — your terminal, your rules.
              </span>
            </div>
          </li>
        </ol>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onDone}
            className="rounded-md border border-surface-border px-4 py-2 text-sm text-zinc-300"
          >
            Skip for now
          </button>
          <button
            type="button"
            onClick={onDone}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Get started
          </button>
        </div>
      </div>
    </div>
  )
}

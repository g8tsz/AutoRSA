import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const el = document.getElementById('root')
if (!el) {
  throw new Error('#root not found')
}

const root = createRoot(el)
const hasPreload = 'api' in window && (window as unknown as { api?: unknown }).api != null
const isElectron = typeof navigator !== 'undefined' && /Electron\//.test(navigator.userAgent)

if (!hasPreload) {
  root.render(
    <div className="m-0 min-h-screen bg-surface p-6 text-left text-sm text-zinc-200">
      <p className="text-base font-semibold text-amber-200">
        {isElectron
          ? 'window.api is missing (Electron preload did not run)'
          : "You're viewing the dev server in a web browser — not the app"}
      </p>
      {!isElectron && (
        <>
          <p className="mt-2 text-zinc-400">
            <strong className="text-zinc-200">Do not</strong> use Chrome, Edge, or Firefox on{' '}
            <code className="text-indigo-300">http://localhost:5173</code>. This site is only a dev
            server; the real UI runs inside an <strong>Electron</strong> window.
          </p>
          <p className="mt-2 text-zinc-500">
            Close this tab. In the same terminal where you ran <code>npm run dev</code>, wait for
            <span className="text-zinc-300"> "start electron app"</span>, then use the{' '}
            <strong>separate window</strong> titled <strong>AutoRSA Desktop</strong> (it may be behind
            other windows or on another monitor).
          </p>
        </>
      )}
      {isElectron && (
        <p className="mt-2 text-zinc-400">
          Check the <strong>terminal</strong> for a line like <code className="text-indigo-300">[main] Preload file:</code>{' '}
          and that the file exists. If the path is wrong, re-run <code>npm run dev</code> from the project
          folder.
        </p>
      )}
    </div>
  )
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  )
}

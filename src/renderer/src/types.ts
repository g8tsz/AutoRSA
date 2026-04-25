export type TaskRow = {
  id: string
  groupId: string
  name: string
  mode: 'buy' | 'sell' | 'holdings'
  amount: number
  tickers: string
  brokers: string
  notBrokers: string
  dry: boolean
  status: 'idle' | 'running' | 'ok' | 'error'
  lastError?: string
  lastRun?: string
}

export type TaskGroup = {
  id: string
  name: string
  parentId?: string
}

export type AppSettings = {
  envDirectory: string
  autoRsaExecutable: string
  /** Max characters kept in the output panel; older log is dropped from the top. */
  maxLogChars: number
  /**
   * Kill the process after this many seconds (0 = off).
   * Useful if a broker script hangs; match your worst-case need.
   */
  commandTimeoutSec: number
  /**
   * When true, all buy/sell runs use dry mode and the live-order confirmation is skipped.
   */
  forceDryRun: boolean
  /** Re-run a task after failure (same run session). */
  retryOnFailure: { enabled: boolean; maxAttempts: number }
  /** Default broker profile applied when task brokers are `all`. */
  brokerProfile: { include: string; exclude: string; applyToAllKeyword: boolean }
  /** Optional live-order guard to prevent large accidental orders. */
  riskGuard: { enabled: boolean; maxSharesPerOrder: number }
  /**
   * When true, increment local `runStats` in the store (no network; for your own review).
   */
  telemetryLocalEnabled: boolean
}

export type Store = {
  settings: AppSettings
  groups: TaskGroup[]
  tasks: TaskRow[]
  /**
   * False until the user finishes the first-run steps (or skips).
   * Omitted/undefined in older store.json → treated as true (skip wizard for existing users).
   */
  onboardingComplete?: boolean
  /** Local counters when `telemetryLocalEnabled` is on. */
  runStats: { ok: number; err: number }
  /** Most recent command runs for quick auditing/debugging. */
  runHistory?: CommandHistoryEntry[]
}

export type CommandHistoryEntry = {
  id: string
  taskId: string
  taskName: string
  mode: TaskRow['mode']
  commandLine: string
  cwd: string
  ok: boolean
  code: number
  exitKind?: RsaRunResult['exitKind']
  elapsedSec: number
  createdAt: string
}

export type RsaRunResult = {
  ok: boolean
  code: number
  error?: string
  exitKind?: 'normal' | 'timeout' | 'spawn_error' | 'user_stopped' | 'signal'
}

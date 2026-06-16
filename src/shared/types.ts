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
  /** Order within group for batch runs. */
  sortOrder?: number
}

export type TaskGroup = {
  id: string
  name: string
  /** Nested groups: child groups reference parent id. */
  parentId?: string
  sortOrder?: number
}

export type RiskGuardSettings = {
  enabled: boolean
  maxSharesPerOrder: number
  maxLiveOrdersPerBatch: number
  maxTotalSharesPerTicker: number
  requireTypedConfirmForLive: boolean
}

export type AppSettings = {
  envDirectory: string
  autoRsaExecutable: string
  maxLogChars: number
  commandTimeoutSec: number
  forceDryRun: boolean
  retryOnFailure: { enabled: boolean; maxAttempts: number }
  brokerProfile: { include: string; exclude: string; applyToAllKeyword: boolean }
  riskGuard: RiskGuardSettings
  telemetryLocalEnabled: boolean
  theme: 'dark' | 'light'
  /** When false, batch stops after first task error. */
  batchContinueOnError: boolean
  /** Pause between batch tasks (seconds). */
  staggerDelaySec: number
  /** Per-broker timeout override (seconds); falls back to commandTimeoutSec. */
  perBrokerTimeoutSec: Record<string, number>
  /** User acknowledged live-order disclaimer. */
  liveOrderAcknowledged: boolean
}

export type RsaRunResult = {
  ok: boolean
  code: number
  error?: string
  exitKind?: 'normal' | 'timeout' | 'spawn_error' | 'user_stopped' | 'signal'
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

export type TaskTemplate = {
  id: string
  name: string
  task: Omit<TaskRow, 'id' | 'groupId' | 'status' | 'lastError' | 'lastRun' | 'sortOrder'>
}

export type ScheduledJob = {
  id: string
  name: string
  groupId: string
  /** cron-like: daily HH:MM in local time, or interval minutes */
  scheduleType: 'daily' | 'interval'
  dailyTime?: string
  intervalMinutes?: number
  enabled: boolean
  lastRunAt?: string
  nextRunAt?: string
}

export type HoldingsRow = {
  broker: string
  ticker: string
  quantity: string
}

export type HoldingsSnapshot = {
  id: string
  taskId: string
  taskName: string
  createdAt: string
  rows: HoldingsRow[]
  rawLog?: string
}

export type DeletedTaskBackup = {
  task: TaskRow
  deletedAt: string
}

export type Store = {
  settings: AppSettings
  groups: TaskGroup[]
  tasks: TaskRow[]
  onboardingComplete?: boolean
  runStats: { ok: number; err: number }
  runHistory?: CommandHistoryEntry[]
  taskTemplates?: TaskTemplate[]
  scheduledJobs?: ScheduledJob[]
  holdingsSnapshots?: HoldingsSnapshot[]
  deletedTasksBackup?: DeletedTaskBackup[]
}

export type PathStatus = {
  envDirExists: boolean
  envFileExists: boolean
  exeExists: boolean
  botResolvedSummary: string | null
  botSetupHint: string | null
}

export type EnvDoctorReport = {
  ok: boolean
  checks: Array<{ label: string; ok: boolean; detail: string }>
  fixCommand: string
}

export type VersionStatus = {
  installedVersion: string | null
  latestKnownVersion: string
  upToDate: boolean | null
  detail: string
}

import { FALLBACK_LATEST_AUTORSA, MAX_DELETED_BACKUP, MAX_HOLDINGS_SNAPSHOTS, MAX_RUN_HISTORY, MAX_TASK_TEMPLATES } from './constants'
import type { AppSettings, RiskGuardSettings, Store } from './types'

export function defaultRiskGuard(): RiskGuardSettings {
  return {
    enabled: true,
    maxSharesPerOrder: 1,
    maxLiveOrdersPerBatch: 5,
    maxTotalSharesPerTicker: 10,
    requireTypedConfirmForLive: false
  }
}

export function defaultSettings(envDirectory: string, autoRsaExecutable: string): AppSettings {
  return {
    envDirectory,
    autoRsaExecutable,
    maxLogChars: 400_000,
    commandTimeoutSec: 0,
    forceDryRun: false,
    retryOnFailure: { enabled: false, maxAttempts: 2 },
    brokerProfile: { include: 'all', exclude: '', applyToAllKeyword: true },
    riskGuard: defaultRiskGuard(),
    telemetryLocalEnabled: false,
    theme: 'dark',
    batchContinueOnError: true,
    staggerDelaySec: 0,
    perBrokerTimeoutSec: {},
    liveOrderAcknowledged: false
  }
}

function sanitizeRiskGuard(r: Partial<RiskGuardSettings> | undefined): RiskGuardSettings {
  const d = defaultRiskGuard()
  if (!r || typeof r !== 'object') return d
  return {
    enabled: Boolean(r.enabled ?? d.enabled),
    maxSharesPerOrder: Math.max(1, Math.floor(Number(r.maxSharesPerOrder) || d.maxSharesPerOrder)),
    maxLiveOrdersPerBatch: Math.max(1, Math.floor(Number(r.maxLiveOrdersPerBatch) || d.maxLiveOrdersPerBatch)),
    maxTotalSharesPerTicker: Math.max(
      1,
      Math.floor(Number(r.maxTotalSharesPerTicker) || d.maxTotalSharesPerTicker)
    ),
    requireTypedConfirmForLive: Boolean(r.requireTypedConfirmForLive ?? d.requireTypedConfirmForLive)
  }
}

/** Normalize persisted store before save/load. */
export function sanitizeStore(incoming: Store, defaults: AppSettings): Store {
  const s: Store = {
    ...incoming,
    settings: { ...defaults, ...incoming.settings },
    groups: Array.isArray(incoming.groups) ? incoming.groups : [],
    tasks: Array.isArray(incoming.tasks) ? incoming.tasks : [],
    runStats: {
      ok: Math.max(0, Math.floor(incoming.runStats?.ok ?? 0)),
      err: Math.max(0, Math.floor(incoming.runStats?.err ?? 0))
    },
    onboardingComplete: incoming.onboardingComplete,
    runHistory: Array.isArray(incoming.runHistory) ? incoming.runHistory.slice(0, MAX_RUN_HISTORY) : [],
    taskTemplates: Array.isArray(incoming.taskTemplates)
      ? incoming.taskTemplates.slice(0, MAX_TASK_TEMPLATES)
      : [],
    scheduledJobs: Array.isArray(incoming.scheduledJobs) ? incoming.scheduledJobs : [],
    holdingsSnapshots: Array.isArray(incoming.holdingsSnapshots)
      ? incoming.holdingsSnapshots.slice(0, MAX_HOLDINGS_SNAPSHOTS)
      : [],
    deletedTasksBackup: Array.isArray(incoming.deletedTasksBackup)
      ? incoming.deletedTasksBackup.slice(0, MAX_DELETED_BACKUP)
      : []
  }

  if (typeof s.settings.maxLogChars !== 'number' || s.settings.maxLogChars < 5_000) {
    s.settings.maxLogChars = defaults.maxLogChars
  }
  if (typeof s.settings.commandTimeoutSec !== 'number' || s.settings.commandTimeoutSec < 0) {
    s.settings.commandTimeoutSec = 0
  }
  if (typeof s.settings.forceDryRun !== 'boolean') s.settings.forceDryRun = false
  if (!s.settings.retryOnFailure || typeof s.settings.retryOnFailure !== 'object') {
    s.settings.retryOnFailure = { enabled: false, maxAttempts: 2 }
  } else {
    const m = Math.max(1, Math.min(20, Math.floor(s.settings.retryOnFailure.maxAttempts || 2)))
    s.settings.retryOnFailure = {
      enabled: Boolean(s.settings.retryOnFailure.enabled),
      maxAttempts: m
    }
  }
  if (!s.settings.brokerProfile || typeof s.settings.brokerProfile !== 'object') {
    s.settings.brokerProfile = { include: 'all', exclude: '', applyToAllKeyword: true }
  } else {
    s.settings.brokerProfile = {
      include: String(s.settings.brokerProfile.include ?? 'all'),
      exclude: String(s.settings.brokerProfile.exclude ?? ''),
      applyToAllKeyword: Boolean(s.settings.brokerProfile.applyToAllKeyword)
    }
  }
  s.settings.riskGuard = sanitizeRiskGuard(s.settings.riskGuard)
  if (typeof s.settings.telemetryLocalEnabled !== 'boolean') {
    s.settings.telemetryLocalEnabled = false
  }
  if (s.settings.theme !== 'light' && s.settings.theme !== 'dark') {
    s.settings.theme = 'dark'
  }
  if (typeof s.settings.batchContinueOnError !== 'boolean') {
    s.settings.batchContinueOnError = true
  }
  if (typeof s.settings.staggerDelaySec !== 'number' || s.settings.staggerDelaySec < 0) {
    s.settings.staggerDelaySec = 0
  }
  if (!s.settings.perBrokerTimeoutSec || typeof s.settings.perBrokerTimeoutSec !== 'object') {
    s.settings.perBrokerTimeoutSec = {}
  } else {
    const clean: Record<string, number> = {}
    for (const [k, v] of Object.entries(s.settings.perBrokerTimeoutSec)) {
      const n = Math.floor(Number(v))
      if (n > 0) clean[k.toLowerCase()] = n
    }
    s.settings.perBrokerTimeoutSec = clean
  }
  if (typeof s.settings.liveOrderAcknowledged !== 'boolean') {
    s.settings.liveOrderAcknowledged = false
  }

  // Ensure sortOrder on tasks/groups
  s.tasks = s.tasks.map((t, i) => ({
    ...t,
    sortOrder: typeof t.sortOrder === 'number' ? t.sortOrder : i
  }))
  s.groups = s.groups.map((g, i) => ({
    ...g,
    sortOrder: typeof g.sortOrder === 'number' ? g.sortOrder : i
  }))

  return s
}

export { FALLBACK_LATEST_AUTORSA }

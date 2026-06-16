import { describe, expect, it } from 'vitest'
import { defaultSettings, sanitizeStore } from './sanitizeStore'
import type { Store } from './types'

describe('sanitizeStore', () => {
  it('adds default risk guard fields', () => {
    const ds = defaultSettings('/env', '/exe')
    const raw: Store = {
      settings: { ...ds, riskGuard: { enabled: true, maxSharesPerOrder: 1 } as Store['settings']['riskGuard'] },
      groups: [],
      tasks: [],
      runStats: { ok: 0, err: 0 }
    }
    const s = sanitizeStore(raw, ds)
    expect(s.settings.riskGuard.maxLiveOrdersPerBatch).toBeGreaterThan(0)
    expect(s.settings.theme).toBe('dark')
  })
})

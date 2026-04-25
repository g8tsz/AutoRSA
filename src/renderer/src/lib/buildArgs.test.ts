import { describe, expect, it } from 'vitest'
import { buildCliArgs, isEffectiveDry, taskRunPreflight } from './buildArgs'
import type { AppSettings, TaskRow } from '../types'

const base = (over: Partial<TaskRow>): TaskRow => ({
  id: '1',
  groupId: 'g',
  name: 't',
  mode: 'holdings',
  amount: 0,
  tickers: '',
  brokers: 'all',
  notBrokers: '',
  dry: true,
  status: 'idle',
  ...over
})

const baseSettings: Pick<AppSettings, 'forceDryRun'> = { forceDryRun: false }

describe('isEffectiveDry', () => {
  it('is true when task is dry', () => {
    expect(isEffectiveDry(base({ dry: true, mode: 'buy' }), { forceDryRun: false })).toBe(true)
  })
  it('is true when global force is on', () => {
    expect(isEffectiveDry(base({ dry: false, mode: 'buy' }), { forceDryRun: true })).toBe(true)
  })
  it('is false for live buy when not forced', () => {
    expect(isEffectiveDry(base({ dry: false, mode: 'buy' }), { forceDryRun: false })).toBe(false)
  })
})

describe('taskRunPreflight', () => {
  it('rejects empty brokers', () => {
    expect(taskRunPreflight(base({ brokers: '  ' }))).not.toBeNull()
  })
  it('rejects buy without tickers', () => {
    expect(taskRunPreflight(base({ mode: 'buy', tickers: '', brokers: 'all' }))).not.toBeNull()
  })
  it('allows holdings with brokers set', () => {
    expect(taskRunPreflight(base({ mode: 'holdings', brokers: 'robinhood' }))).toBeNull()
  })
})

describe('buildCliArgs', () => {
  it('holdings has no dry flag in args', () => {
    const a = buildCliArgs(base({ mode: 'holdings' }), baseSettings)
    expect(a[0]).toBe('holdings')
  })
  it('buy includes dry from task', () => {
    const a = buildCliArgs(
      base({ mode: 'buy', amount: 1, tickers: 'aapl', dry: true }),
      baseSettings
    )
    expect(a).toContain('true')
  })
  it('buy forces dry from settings', () => {
    const a = buildCliArgs(
      base({ mode: 'buy', amount: 1, tickers: 'aapl', dry: false }),
      { forceDryRun: true }
    )
    expect(a[a.length - 1]).toBe('true')
  })
})

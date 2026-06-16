import { describe, expect, it } from 'vitest'
import { buildCliArgs } from '../src/renderer/src/lib/buildArgs'
import { parseHoldingsFromLog } from '../src/renderer/src/lib/parseHoldings'

/** Smoke tests that do not require Electron. */
describe('smoke', () => {
  it('buildCliArgs holdings shape', () => {
    const args = buildCliArgs(
      {
        id: '1',
        groupId: 'g',
        name: 't',
        mode: 'holdings',
        amount: 0,
        tickers: '',
        brokers: 'all',
        notBrokers: '',
        dry: true,
        status: 'idle'
      },
      { forceDryRun: false }
    )
    expect(args[0]).toBe('holdings')
  })

  it('parseHoldingsFromLog extracts rows', () => {
    const rows = parseHoldingsFromLog('robinhood: AAPL 10\n')
    expect(rows.some((r) => r.broker === 'robinhood' && r.ticker === 'AAPL')).toBe(true)
  })
})

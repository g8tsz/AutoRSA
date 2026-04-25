import { describe, expect, it } from 'vitest'
import { parseBrokerSignals } from './parseBrokerSignals'

describe('parseBrokerSignals', () => {
  it('maps not-found lines to skipped for known brokers', () => {
    const log = 'Chase not found, skipping...\nFidelity not found, skipping...'
    const r = parseBrokerSignals(log)
    expect(r).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ broker: 'chase', status: 'skipped' }),
        expect.objectContaining({ broker: 'fidelity', status: 'skipped' })
      ])
    )
  })

  it('maps Error with to error and prefers error over prior skipped', () => {
    const log = [
      'BBAE not found, skipping...',
      'Error with bbae: Error in bbae: Function did not complete successfully'
    ].join('\n')
    const r = parseBrokerSignals(log)
    const bbae = r.find((x) => x.broker === 'bbae')
    expect(bbae?.status).toBe('error')
  })

  it('maps Exception Error in line when no Error with on that line', () => {
    const log = 'Exception: Error in sofi: Function did not complete successfully'
    const r = parseBrokerSignals(log)
    expect(r.some((x) => x.broker === 'sofi' && x.status === 'error')).toBe(true)
  })

  it('does not invent brokers from TypeError text', () => {
    const log = 'TypeError: sofi_run() missing 1 required positional argument: \'command\''
    const r = parseBrokerSignals(log)
    expect(r).toEqual([])
  })

  it('maps missing env var line to skipped for known key', () => {
    const log = 'WELLSFARGO environment variable not found.'
    const r = parseBrokerSignals(log)
    expect(r).toEqual([
      expect.objectContaining({ broker: 'wellsfargo', status: 'skipped' })
    ])
  })

  it('parses Skipped brokers profile line', () => {
    const log = 'Skipped brokers: robinhood, schwab'
    const r = parseBrokerSignals(log)
    expect(r).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ broker: 'robinhood', status: 'skipped' }),
        expect.objectContaining({ broker: 'schwab', status: 'skipped' })
      ])
    )
  })

  it('ignores unknown not-found broker names', () => {
    const log = 'FooBar not found, skipping...'
    expect(parseBrokerSignals(log)).toEqual([])
  })

  it('orders chips by ALL_BROKER_SLUGS order', () => {
    const log = ['webull not found, skipping...', 'bbae not found, skipping...'].join('\n')
    const r = parseBrokerSignals(log)
    expect(r.map((x) => x.broker)).toEqual(['bbae', 'webull'])
  })
})

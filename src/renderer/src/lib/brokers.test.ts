import { describe, expect, it } from 'vitest'
import { missingEnvByBroker, parseBrokerList, selectionToBrokerCliArg } from './brokers'

describe('brokers', () => {
  it('parseBrokerList expands all', () => {
    expect(parseBrokerList('all').length).toBeGreaterThan(10)
  })
  it('selectionToBrokerCliArg returns all when full set', () => {
    const all = new Set(parseBrokerList('all'))
    expect(selectionToBrokerCliArg(all)).toBe('all')
  })
  it('missingEnvByBroker finds gaps', () => {
    const miss = missingEnvByBroker(['robinhood'], [])
    expect(miss.robinhood).toContain('ROBINHOOD')
  })
})

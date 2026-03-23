import { describe, expect, it } from 'vitest'
import { CADENCE, MONTHS_PER_PERIOD } from './cadence.js'

describe('CADENCE', () => {
  it('has monthly and quarterly values', () => {
    expect(CADENCE.monthly).toBe('monthly')
    expect(CADENCE.quarterly).toBe('quarterly')
  })

  it('is frozen', () => {
    expect(Object.isFrozen(CADENCE)).toBe(true)
  })
})

describe('MONTHS_PER_PERIOD', () => {
  it('monthly has 1 month per period', () => {
    expect(MONTHS_PER_PERIOD.monthly).toBe(1)
  })

  it('quarterly has 3 months per period', () => {
    expect(MONTHS_PER_PERIOD.quarterly).toBe(3)
  })

  it('is frozen', () => {
    expect(Object.isFrozen(MONTHS_PER_PERIOD)).toBe(true)
  })

  it('has an entry for each cadence', () => {
    for (const key of Object.values(CADENCE)) {
      expect(MONTHS_PER_PERIOD[key]).toBeDefined()
    }
  })
})

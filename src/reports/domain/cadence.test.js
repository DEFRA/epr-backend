import { describe, expect, it } from 'vitest'
import { MONTHLY, QUARTERLY } from './cadence.js'

describe('cadence', () => {
  it('MONTHLY has 1-month periods, 12 per year', () => {
    expect(MONTHLY).toStrictEqual({
      id: 'monthly',
      monthsPerPeriod: 1,
      periodsPerYear: 12
    })
  })

  it('QUARTERLY has 3-month periods, 4 per year', () => {
    expect(QUARTERLY).toStrictEqual({
      id: 'quarterly',
      monthsPerPeriod: 3,
      periodsPerYear: 4
    })
  })

  it('MONTHLY is frozen', () => {
    expect(Object.isFrozen(MONTHLY)).toBe(true)
  })

  it('QUARTERLY is frozen', () => {
    expect(Object.isFrozen(QUARTERLY)).toBe(true)
  })
})

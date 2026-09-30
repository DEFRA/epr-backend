import { describe, expect, it } from 'vitest'
import { currentUtcYear, isFutureYear, yearBounds } from './year.js'

describe('currentUtcYear', () => {
  it('reads the year in UTC', () => {
    expect(currentUtcYear(new Date('2026-01-01T00:30:00.000Z'))).toBe(2026)
  })

  it('defaults to now', () => {
    expect(currentUtcYear()).toBe(new Date().getUTCFullYear())
  })
})

describe('yearBounds', () => {
  it('returns the first and last calendar dates of the year', () => {
    expect(yearBounds(2026)).toEqual({
      start: '2026-01-01',
      end: '2026-12-31'
    })
  })
})

describe('isFutureYear', () => {
  const now = new Date('2026-06-15T00:00:00.000Z')

  it('is true for a year later than now', () => {
    expect(isFutureYear(2027, now)).toBe(true)
  })

  it('is false for the current year', () => {
    expect(isFutureYear(2026, now)).toBe(false)
  })

  it('is false for a past year', () => {
    expect(isFutureYear(2025, now)).toBe(false)
  })
})

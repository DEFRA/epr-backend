import { describe, expect, it } from 'vitest'
import { CADENCE } from './cadence.js'
import { periodForDate } from './period-for-date.js'

describe('periodForDate', () => {
  it('maps each month to its own period under a monthly cadence', () => {
    expect(periodForDate('2026-01-15', CADENCE.monthly)).toEqual({
      year: 2026,
      period: 1
    })
    expect(periodForDate('2026-12-31', CADENCE.monthly)).toEqual({
      year: 2026,
      period: 12
    })
  })

  it('groups months into quarters under a quarterly cadence', () => {
    expect(periodForDate('2026-03-31', CADENCE.quarterly)).toEqual({
      year: 2026,
      period: 1
    })
    expect(periodForDate('2026-04-01', CADENCE.quarterly)).toEqual({
      year: 2026,
      period: 2
    })
    expect(periodForDate('2026-12-01', CADENCE.quarterly)).toEqual({
      year: 2026,
      period: 4
    })
  })

  it('accepts a Date as well as an ISO string', () => {
    expect(
      periodForDate(new Date('2025-07-09T12:00:00Z'), CADENCE.quarterly)
    ).toEqual({ year: 2025, period: 3 })
  })
})

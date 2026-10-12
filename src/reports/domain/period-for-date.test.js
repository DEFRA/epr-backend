import { describe, expect, it } from 'vitest'
import { isDateInRange } from './aggregation/filter-records-by-date.js'
import { CADENCE, MONTHS_PER_PERIOD } from './cadence.js'
import { periodForDate } from './period-for-date.js'
import { periodBounds } from './reporting-period.js'

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

  // Summary logs place rows with periodForDate; reports slice them with
  // isDateInRange. A row must land in the same period either way.
  describe('agrees with the period the report slices a date into', () => {
    const cadences = Object.values(CADENCE)
    const MONTHS_PER_YEAR = 12

    it.each(
      [
        '2025-02',
        '2025-03-31',
        '2025-04-01',
        '2025-01-31T23:30:00.000Z',
        '2025-02-01T00:00:00.000Z',
        '2025-12-31'
      ].flatMap((date) => cadences.map((cadence) => ({ date, cadence })))
    )(
      'places $date ($cadence) in a period whose bounds contain it',
      ({ date, cadence }) => {
        const { year, period } = periodForDate(date, cadence)

        expect(isDateInRange(date, periodBounds(cadence, year, period))).toBe(
          true
        )
      }
    )

    it.each(cadences)(
      'places a non-ISO date string in no period (%s)',
      (cadence) => {
        const date = '10/02/2025'
        const { year, period } = periodForDate(date, cadence)

        const periodsInYear = MONTHS_PER_YEAR / MONTHS_PER_PERIOD[cadence]
        const periods = Array.from({ length: periodsInYear }, (_, i) => i + 1)

        expect(Number.isNaN(year)).toBe(true)
        expect(Number.isNaN(period)).toBe(true)
        expect(
          periods.some((p) =>
            isDateInRange(date, periodBounds(cadence, 2025, p))
          )
        ).toBe(false)
      }
    )
  })
})

import { CADENCE } from '#reports/domain/cadence.js'
import {
  periodBounds,
  reportingPeriodFromStoredDates
} from '#reports/domain/reporting-period.js'
import { isDateInRange } from '#root/reports/domain/aggregation/filter-records-by-date.js'

describe('#isDateInRange', () => {
  // A whole calendar year is no period, so it is built from bare bounds.
  const wholeOf2025 = reportingPeriodFromStoredDates('2025-01-01', '2025-12-31')

  describe('invalid dates', () => {
    it.each([
      ['invalid month', '2025-22-22'],
      ['invalid string at end', '2025-22-22-garbage'],
      ['invalid day', '2025-01-99'],
      ['month 13', '2025-13-01'],
      ['all zeros', '0000-00-00'],
      ['garbage string', 'not-a-date'],
      ['empty string', ''],
      ['null', null],
      ['number', 20250101],
      ['undefined', undefined]
    ])('returns false for %s (%s)', (_label, value) => {
      expect(isDateInRange(value, wholeOf2025)).toBe(false)
    })
  })

  describe('valid dates', () => {
    it('returns true when date is within range', () => {
      expect(isDateInRange('2025-06-15', wholeOf2025)).toBe(true)
    })

    it('returns true for start boundary', () => {
      expect(isDateInRange('2025-01-01', wholeOf2025)).toBe(true)
    })

    it('returns true for end boundary', () => {
      expect(isDateInRange('2025-12-31', wholeOf2025)).toBe(true)
    })

    it('returns false when date is before range', () => {
      expect(isDateInRange('2024-12-31', wholeOf2025)).toBe(false)
    })

    it('returns false when date is after range', () => {
      expect(isDateInRange('2026-01-01', wholeOf2025)).toBe(false)
    })
  })

  describe('month-format dates (YYYY-MM)', () => {
    it('returns true for first month of range', () => {
      expect(isDateInRange('2025-01', wholeOf2025)).toBe(true)
    })

    it('returns true for middle month of range', () => {
      expect(isDateInRange('2025-06', wholeOf2025)).toBe(true)
    })

    it('returns true for last month of range', () => {
      expect(isDateInRange('2025-12', wholeOf2025)).toBe(true)
    })

    it('returns false for month before range', () => {
      expect(isDateInRange('2024-12', wholeOf2025)).toBe(false)
    })

    it('returns false for month after range', () => {
      expect(isDateInRange('2026-01', wholeOf2025)).toBe(false)
    })

    it('handles quarterly boundaries correctly', () => {
      const q1 = periodBounds(CADENCE.quarterly, 2026, 1)

      expect(isDateInRange('2026-01', q1)).toBe(true)
      expect(isDateInRange('2026-02', q1)).toBe(true)
      expect(isDateInRange('2026-03', q1)).toBe(true)
      expect(isDateInRange('2025-12', q1)).toBe(false)
      expect(isDateInRange('2026-04', q1)).toBe(false)
    })
  })
})

import { isDateInRange } from '#root/reports/domain/aggregation/filter-records-by-date.js'

describe('#isDateInRange', () => {
  const start = '2025-01-01'
  const end = '2025-12-31'

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
      expect(isDateInRange(value, start, end)).toBe(false)
    })
  })

  describe('valid dates', () => {
    it('returns true when date is within range', () => {
      expect(isDateInRange('2025-06-15', start, end)).toBe(true)
    })

    it('returns true for start boundary', () => {
      expect(isDateInRange('2025-01-01', start, end)).toBe(true)
    })

    it('returns true for end boundary', () => {
      expect(isDateInRange('2025-12-31', start, end)).toBe(true)
    })

    it('returns false when date is before range', () => {
      expect(isDateInRange('2024-12-31', start, end)).toBe(false)
    })

    it('returns false when date is after range', () => {
      expect(isDateInRange('2026-01-01', start, end)).toBe(false)
    })
  })
})

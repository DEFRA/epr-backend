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
    it.each([
      {
        scenario: 'a date inside the period',
        value: '2025-06-15',
        expected: true
      },
      { scenario: 'the start bound', value: '2025-01-01', expected: true },
      { scenario: 'the end bound', value: '2025-12-31', expected: true },
      {
        scenario: 'a datetime on the start bound',
        value: '2025-01-01T00:00:00.000Z',
        expected: true
      },
      {
        scenario: 'a datetime on the end bound, which sorts after it untrimmed',
        value: '2025-12-31T10:00:00.000Z',
        expected: true
      },
      {
        scenario: 'the day before the period',
        value: '2024-12-31',
        expected: false
      },
      {
        scenario: 'the day after the period',
        value: '2026-01-01',
        expected: false
      }
    ])('returns $expected for $scenario', ({ value, expected }) => {
      expect(isDateInRange(value, wholeOf2025)).toBe(expected)
    })
  })

  describe('month-format dates (YYYY-MM)', () => {
    it.each([
      {
        scenario: 'the first month of the period',
        value: '2025-01',
        expected: true
      },
      {
        scenario: 'a middle month of the period',
        value: '2025-06',
        expected: true
      },
      {
        scenario: 'the last month of the period',
        value: '2025-12',
        expected: true
      },
      {
        scenario: 'the month before the period',
        value: '2024-12',
        expected: false
      },
      {
        scenario: 'the month after the period',
        value: '2026-01',
        expected: false
      }
    ])('returns $expected for $scenario', ({ value, expected }) => {
      expect(isDateInRange(value, wholeOf2025)).toBe(expected)
    })

    describe('against a quarter', () => {
      const q1 = periodBounds(CADENCE.quarterly, 2026, 1)

      it.each([
        {
          scenario: 'the first month of the quarter',
          value: '2026-01',
          expected: true
        },
        {
          scenario: 'a middle month of the quarter',
          value: '2026-02',
          expected: true
        },
        {
          scenario: 'the last month of the quarter',
          value: '2026-03',
          expected: true
        },
        {
          scenario: 'the month before the quarter',
          value: '2025-12',
          expected: false
        },
        {
          scenario: 'the month after the quarter',
          value: '2026-04',
          expected: false
        }
      ])('returns $expected for $scenario', ({ value, expected }) => {
        expect(isDateInRange(value, q1)).toBe(expected)
      })
    })
  })
})

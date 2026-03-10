import { describe, expect, it } from 'vitest'
import { getCurrentPeriod } from './current-period.js'
import { MONTHLY, QUARTERLY } from './cadence.js'

describe('getCurrentPeriod', () => {
  describe('monthly', () => {
    it.each([
      {
        date: new Date(2026, 0, 15),
        expected: {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-01-31'
        }
      },
      {
        date: new Date(2026, 1, 10),
        expected: {
          year: 2026,
          period: 2,
          startDate: '2026-02-01',
          endDate: '2026-02-28'
        }
      },
      {
        date: new Date(2026, 11, 31),
        expected: {
          year: 2026,
          period: 12,
          startDate: '2026-12-01',
          endDate: '2026-12-31'
        }
      }
    ])(
      'returns period $expected.period for $expected.startDate',
      ({ date, expected }) => {
        expect(getCurrentPeriod(MONTHLY, date)).toStrictEqual(expected)
      }
    )
  })

  describe('quarterly', () => {
    it.each([
      {
        date: new Date(2026, 0, 1),
        expected: {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-03-31'
        }
      },
      {
        date: new Date(2026, 2, 31),
        expected: {
          year: 2026,
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-03-31'
        }
      },
      {
        date: new Date(2026, 5, 15),
        expected: {
          year: 2026,
          period: 2,
          startDate: '2026-04-01',
          endDate: '2026-06-30'
        }
      },
      {
        date: new Date(2026, 11, 25),
        expected: {
          year: 2026,
          period: 4,
          startDate: '2026-10-01',
          endDate: '2026-12-31'
        }
      }
    ])(
      'returns Q$expected.period for $expected.startDate',
      ({ date, expected }) => {
        expect(getCurrentPeriod(QUARTERLY, date)).toStrictEqual(expected)
      }
    )
  })
})

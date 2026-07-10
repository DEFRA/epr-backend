import { describe, expect, it } from 'vitest'
import { filterPeriodsFromDate } from './filter-periods-from-date.js'

const JAN = {
  year: 2026,
  period: 1,
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  dueDate: '2026-02-20',
  report: null
}
const FEB = {
  year: 2026,
  period: 2,
  startDate: '2026-02-01',
  endDate: '2026-02-28',
  dueDate: '2026-03-20',
  report: null
}
const MAR = {
  year: 2026,
  period: 3,
  startDate: '2026-03-01',
  endDate: '2026-03-31',
  dueDate: '2026-04-20',
  report: null
}

describe('filterPeriodsFromDate', () => {
  describe('lower bound (fromDate)', () => {
    it('drops periods that ended before the start date', () => {
      // MAR.startDate also exercises the start date landing on a period's start day
      expect(filterPeriodsFromDate([JAN, FEB, MAR], MAR.startDate)).toEqual([
        MAR
      ])
    })

    it('keeps the period containing a mid-period start date', () => {
      expect(filterPeriodsFromDate([JAN, FEB, MAR], '2026-03-15')).toEqual([
        MAR
      ])
    })

    it('keeps a period whose end date equals the start date', () => {
      expect(filterPeriodsFromDate([JAN, FEB, MAR], FEB.endDate)).toEqual([
        FEB,
        MAR
      ])
    })

    it('keeps every period when the start date precedes them all', () => {
      expect(filterPeriodsFromDate([JAN, FEB, MAR], '2025-12-31')).toEqual([
        JAN,
        FEB,
        MAR
      ])
    })

    it('returns empty when the start date is after every period', () => {
      expect(filterPeriodsFromDate([JAN, FEB, MAR], '2026-04-01')).toEqual([])
    })

    it('returns empty for an empty period list', () => {
      expect(filterPeriodsFromDate([], MAR.startDate)).toEqual([])
    })

    it('does not mutate the input array', () => {
      const input = [JAN, FEB, MAR]
      const result = filterPeriodsFromDate(input, MAR.startDate)

      expect(input).toEqual([JAN, FEB, MAR])
      expect(result).not.toBe(input)
    })
  })

  describe('upper bound (toDate)', () => {
    it('drops periods that start after the end date', () => {
      expect(
        filterPeriodsFromDate([JAN, FEB, MAR], JAN.startDate, FEB.endDate)
      ).toEqual([JAN, FEB])
    })

    it('keeps the period containing a mid-period end date', () => {
      expect(
        filterPeriodsFromDate([JAN, FEB, MAR], JAN.startDate, '2026-02-15')
      ).toEqual([JAN, FEB])
    })

    it('keeps a period whose start date equals the end date', () => {
      expect(
        filterPeriodsFromDate([JAN, FEB, MAR], JAN.startDate, MAR.startDate)
      ).toEqual([JAN, FEB, MAR])
    })

    it('applies the lower and upper bounds together', () => {
      expect(
        filterPeriodsFromDate([JAN, FEB, MAR], FEB.startDate, FEB.endDate)
      ).toEqual([FEB])
    })
  })
})

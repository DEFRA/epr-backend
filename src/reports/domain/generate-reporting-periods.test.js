import { describe, expect, it } from 'vitest'
import { CADENCE } from './cadence.js'
import { generateReportingPeriods } from './generate-reporting-periods.js'

const march20 = new Date('2026-03-20T12:00:00Z')

describe('generateReportingPeriods', () => {
  describe('monthly cadence', () => {
    it('returns periods up to and including the current month', () => {
      const periods = generateReportingPeriods(CADENCE.monthly, 2026, march20)

      expect(periods).toHaveLength(3)
      expect(periods[0].period).toBe(1)
      expect(periods[2].period).toBe(3)
    })

    it('returns correct start and end dates', () => {
      const periods = generateReportingPeriods(CADENCE.monthly, 2026, march20)

      expect(periods[0].startDate).toBe('2026-01-01')
      expect(periods[0].endDate).toBe('2026-01-31')
      expect(periods[1].startDate).toBe('2026-02-01')
      expect(periods[1].endDate).toBe('2026-02-28')
      expect(periods[2].startDate).toBe('2026-03-01')
      expect(periods[2].endDate).toBe('2026-03-31')
    })

    it('computes dueDate as 20th of month following period end', () => {
      const periods = generateReportingPeriods(CADENCE.monthly, 2026, march20)

      expect(periods[0].dueDate).toBe('2026-02-20')
      expect(periods[1].dueDate).toBe('2026-03-20')
      expect(periods[2].dueDate).toBe('2026-04-20')
    })

    it('computes dueDate for December as January of next year', () => {
      const december = new Date('2026-12-15T12:00:00Z')
      const periods = generateReportingPeriods(CADENCE.monthly, 2026, december)

      expect(periods[11].dueDate).toBe('2027-01-20')
    })

    it('returns report as null for all periods', () => {
      const periods = generateReportingPeriods(CADENCE.monthly, 2026, march20)

      expect(periods.every((p) => p.report === null)).toBe(true)
    })

    it('excludes future months', () => {
      const periods = generateReportingPeriods(CADENCE.monthly, 2026, march20)

      expect(periods.find((p) => p.period === 4)).toBeUndefined()
    })

    it('returns all 12 months when current date is in December', () => {
      const december = new Date('2026-12-15T12:00:00Z')
      const periods = generateReportingPeriods(CADENCE.monthly, 2026, december)

      expect(periods).toHaveLength(12)
    })
  })

  describe('quarterly cadence', () => {
    it('returns periods up to and including the current quarter', () => {
      const periods = generateReportingPeriods(CADENCE.quarterly, 2026, march20)

      expect(periods).toHaveLength(1)
      expect(periods[0].period).toBe(1)
    })

    it('returns correct start and end dates', () => {
      const may = new Date('2026-05-15T12:00:00Z')
      const periods = generateReportingPeriods(CADENCE.quarterly, 2026, may)

      expect(periods[0].startDate).toBe('2026-01-01')
      expect(periods[0].endDate).toBe('2026-03-31')
      expect(periods[1].startDate).toBe('2026-04-01')
      expect(periods[1].endDate).toBe('2026-06-30')
    })

    it('computes dueDate as 20th of month following quarter end', () => {
      const may = new Date('2026-05-15T12:00:00Z')
      const periods = generateReportingPeriods(CADENCE.quarterly, 2026, may)

      expect(periods[0].dueDate).toBe('2026-04-20')
      expect(periods[1].dueDate).toBe('2026-07-20')
    })

    it('excludes future quarters', () => {
      const periods = generateReportingPeriods(CADENCE.quarterly, 2026, march20)

      expect(periods.find((p) => p.period === 2)).toBeUndefined()
    })

    it('returns all 4 quarters when current date is in Q4', () => {
      const november = new Date('2026-11-15T12:00:00Z')
      const periods = generateReportingPeriods(
        CADENCE.quarterly,
        2026,
        november
      )

      expect(periods).toHaveLength(4)
    })
  })

  describe('year filtering', () => {
    it('returns empty array for a future year', () => {
      const periods = generateReportingPeriods(CADENCE.monthly, 2027, march20)

      expect(periods).toStrictEqual([])
    })

    it('returns all periods for a past year', () => {
      const periods = generateReportingPeriods(CADENCE.quarterly, 2025, march20)

      expect(periods).toHaveLength(4)
    })
  })
})

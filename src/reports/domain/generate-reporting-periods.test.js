import { describe, expect, it } from 'vitest'
import { CADENCE } from './cadence.js'
import {
  generateAllPeriodsForYear,
  generateReportingPeriods
} from './generate-reporting-periods.js'

describe('generateAllPeriodsForYear', () => {
  it('returns all 12 monthly periods regardless of current date', () => {
    const periods = generateAllPeriodsForYear(CADENCE.monthly, 2099)

    expect(periods).toHaveLength(12)
    expect(periods[0].period).toBe(1)
    expect(periods[11].period).toBe(12)
  })

  it('returns all 4 quarterly periods regardless of current date', () => {
    const periods = generateAllPeriodsForYear(CADENCE.quarterly, 2099)

    expect(periods).toHaveLength(4)
  })

  it('throws TypeError for unknown cadence', () => {
    expect(() => generateAllPeriodsForYear('biweekly', 2026)).toThrow(TypeError)
  })
})

const march20 = new Date('2026-03-20T12:00:00Z')

describe('generateReportingPeriods', () => {
  describe('monthly cadence', () => {
    it('returns only periods that have ended', () => {
      const periods = generateReportingPeriods(CADENCE.monthly, 2026, march20)

      expect(periods).toHaveLength(2)
      expect(periods[0].period).toBe(1)
      expect(periods[1].period).toBe(2)
    })

    it('returns correct start and end dates', () => {
      const periods = generateReportingPeriods(CADENCE.monthly, 2026, march20)

      expect(periods[0].startDate).toBe('2026-01-01')
      expect(periods[0].endDate).toBe('2026-01-31')
      expect(periods[1].startDate).toBe('2026-02-01')
      expect(periods[1].endDate).toBe('2026-02-28')
    })

    it('computes dueDate as 20th of month following period end', () => {
      const periods = generateReportingPeriods(CADENCE.monthly, 2026, march20)

      expect(periods[0].dueDate).toBe('2026-02-20')
      expect(periods[1].dueDate).toBe('2026-03-20')
    })

    it('computes dueDate for December as January of next year', () => {
      const january2027 = new Date('2027-01-15T12:00:00Z')
      const periods = generateReportingPeriods(
        CADENCE.monthly,
        2026,
        january2027
      )

      expect(periods[11].dueDate).toBe('2027-01-20')
    })

    it('returns report as null for all periods', () => {
      const periods = generateReportingPeriods(CADENCE.monthly, 2026, march20)

      expect(periods.every((p) => p.report === null)).toBe(true)
    })

    it('excludes the current in-progress month', () => {
      const periods = generateReportingPeriods(CADENCE.monthly, 2026, march20)

      expect(periods.find((p) => p.period === 3)).toBeUndefined()
    })

    it('returns all 12 months when year has fully ended', () => {
      const january2027 = new Date('2027-01-15T12:00:00Z')
      const periods = generateReportingPeriods(
        CADENCE.monthly,
        2026,
        january2027
      )

      expect(periods).toHaveLength(12)
    })

    it('excludes December when current date is still in December', () => {
      const december = new Date('2026-12-15T12:00:00Z')
      const periods = generateReportingPeriods(CADENCE.monthly, 2026, december)

      expect(periods).toHaveLength(11)
    })
  })

  describe('quarterly cadence', () => {
    it('excludes current quarter that has not ended', () => {
      const periods = generateReportingPeriods(CADENCE.quarterly, 2026, march20)

      expect(periods).toHaveLength(0)
    })

    it('includes quarter once it has ended', () => {
      const april1 = new Date('2026-04-01T00:00:00Z')
      const periods = generateReportingPeriods(CADENCE.quarterly, 2026, april1)

      expect(periods).toHaveLength(1)
      expect(periods[0].period).toBe(1)
    })

    it('returns correct start and end dates', () => {
      const may = new Date('2026-05-15T12:00:00Z')
      const periods = generateReportingPeriods(CADENCE.quarterly, 2026, may)

      expect(periods).toHaveLength(1)
      expect(periods[0].startDate).toBe('2026-01-01')
      expect(periods[0].endDate).toBe('2026-03-31')
    })

    it('computes dueDate as 20th of month following quarter end', () => {
      const may = new Date('2026-05-15T12:00:00Z')
      const periods = generateReportingPeriods(CADENCE.quarterly, 2026, may)

      expect(periods[0].dueDate).toBe('2026-04-20')
    })

    it('excludes future quarters', () => {
      const periods = generateReportingPeriods(CADENCE.quarterly, 2026, march20)

      expect(periods.find((p) => p.period === 2)).toBeUndefined()
    })

    it('returns 3 quarters when current date is in Q4', () => {
      const november = new Date('2026-11-15T12:00:00Z')
      const periods = generateReportingPeriods(
        CADENCE.quarterly,
        2026,
        november
      )

      expect(periods).toHaveLength(3)
    })

    it('returns all 4 quarters when year has fully ended', () => {
      const january2027 = new Date('2027-01-01T00:00:00Z')
      const periods = generateReportingPeriods(
        CADENCE.quarterly,
        2026,
        january2027
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

  describe('validation', () => {
    it('throws TypeError for unknown cadence', () => {
      expect(() => generateReportingPeriods('biweekly', 2026, march20)).toThrow(
        TypeError
      )
    })
  })
})

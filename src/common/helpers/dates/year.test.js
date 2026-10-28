import { describe, expect, it } from 'vitest'
import {
  currentUtcYear,
  isFutureYear,
  nextYear,
  toYear,
  utcYearOf,
  yearBounds,
  yearEndOrToday,
  yearsFromTo
} from './year.js'

describe('utcYearOf', () => {
  it.each([
    ['a date', new Date('2025-12-31T23:30:00.000Z')],
    ['an ISO string', '2025-12-31']
  ])('reads the year of %s in UTC', (_, date) => {
    expect(utcYearOf(date)).toBe(2025)
  })
})

describe('nextYear', () => {
  it('gives the year after', () => {
    expect(nextYear(toYear(2026))).toBe(2027)
  })
})

describe('yearsFromTo', () => {
  it('lists every year from the first to the last, both included', () => {
    expect(yearsFromTo(toYear(2024), toYear(2026))).toStrictEqual([
      2024, 2025, 2026
    ])
  })

  it('lists one year when the first is the last', () => {
    expect(yearsFromTo(toYear(2026), toYear(2026))).toStrictEqual([2026])
  })

  it('lists no years when the last comes before the first', () => {
    expect(yearsFromTo(toYear(2026), toYear(2025))).toStrictEqual([])
  })
})

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
    expect(yearBounds(toYear(2026))).toEqual({
      start: '2026-01-01',
      end: '2026-12-31'
    })
  })
})

describe('yearEndOrToday', () => {
  const today =
    /** @type {import('#common/helpers/date-formatter.js').CalendarDate} */ (
      '2026-06-15'
    )

  it('is the last day of a year that has finished', () => {
    expect(yearEndOrToday(toYear(2025), today)).toBe('2025-12-31')
  })

  it('is today while the year is running', () => {
    expect(yearEndOrToday(toYear(2026), today)).toBe('2026-06-15')
  })
})

describe('isFutureYear', () => {
  const now = new Date('2026-06-15T00:00:00.000Z')

  it('is true for a year later than now', () => {
    expect(isFutureYear(toYear(2027), now)).toBe(true)
  })

  it('is false for the current year', () => {
    expect(isFutureYear(toYear(2026), now)).toBe(false)
  })

  it('is false for a past year', () => {
    expect(isFutureYear(toYear(2025), now)).toBe(false)
  })
})

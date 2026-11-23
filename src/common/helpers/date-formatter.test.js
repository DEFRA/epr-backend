import { describe, expect, it } from 'vitest'
import { invalidArg } from '#test/type-helpers.js'
import {
  calendarDate,
  endOfDay,
  formatDate,
  formatDateISO,
  formatDateTimeDots,
  startOfDay,
  toCalendarDate,
  toISOString,
  utcCalendarDate,
  getMonthNames,
  getMonthsOfYear
} from './date-formatter.js'

describe('formatDate', () => {
  it('should format date in DD/MM/YYYY format', () => {
    const date = new Date('2026-11-22T00:00:00Z')
    expect(formatDate(date)).toBe('22/11/2026')
  })

  it('should format dates with single digit days and months correctly', () => {
    const date = new Date('2026-03-05T00:00:00Z')
    expect(formatDate(date)).toBe('05/03/2026')
  })

  it('should format date string', () => {
    expect(formatDate('2026-03-01')).toBe('01/03/2026')
  })

  it('should format a full ISO datetime string as the calendar date it falls on', () => {
    expect(formatDate('2026-03-01T23:59:59.999Z')).toBe('01/03/2026')
  })

  it('should return empty string for null', () => {
    expect(formatDate(invalidArg(null))).toBe('')
  })
})

describe('formatDateTimeDots', () => {
  it('should format date-time in DD.MM.YY HH:mm format', () => {
    const date = new Date('2026-02-04T14:49:00')
    expect(formatDateTimeDots(date)).toBe('04.02.26 14:49')
  })
})

describe('formatDateISO', () => {
  it('formats year, month, and day as YYYY-MM-DD', () => {
    expect(formatDateISO(2026, 0, 15)).toBe('2026-01-15')
  })

  it('pads single-digit month and day', () => {
    expect(formatDateISO(2026, 2, 5)).toBe('2026-03-05')
  })

  it('handles day 0 as last day of previous month', () => {
    expect(formatDateISO(2026, 3, 0)).toBe('2026-03-31')
  })

  it('handles month overflow into next year', () => {
    expect(formatDateISO(2026, 12, 1)).toBe('2027-01-01')
  })
})

describe('calendarDate', () => {
  it('returns a bare date string unchanged', () => {
    expect(calendarDate('2025-01-31')).toBe('2025-01-31')
  })

  it('extracts the calendar date from a full ISO datetime with start-of-day time', () => {
    expect(calendarDate('2025-01-31T00:00:00.000Z')).toBe('2025-01-31')
  })

  it('extracts the calendar date from a full ISO datetime with end-of-day time', () => {
    expect(calendarDate('2025-01-31T23:59:59.999Z')).toBe('2025-01-31')
  })
})

describe('utcCalendarDate', () => {
  it('returns the calendar date a Date falls on in UTC', () => {
    expect(utcCalendarDate(new Date('2025-01-31T12:00:00.000Z'))).toBe(
      '2025-01-31'
    )
  })

  it('returns the previous day for an instant just after midnight UK summer time', () => {
    expect(utcCalendarDate(new Date('2025-07-01T00:30:00+01:00'))).toBe(
      '2025-06-30'
    )
  })
})

describe('toCalendarDate', () => {
  it.each([
    { value: new Date('2025-01-31T12:00:00.000Z'), desc: 'a Date' },
    { value: '2025-01-31', desc: 'a bare date string' },
    { value: '2025-01-31T12:00:00.000Z', desc: 'a full ISO datetime string' }
  ])('returns the calendar date for $desc', ({ value }) => {
    expect(toCalendarDate(value)).toBe('2025-01-31')
  })
})

describe('startOfDay', () => {
  it('expands a bare date string to UTC start-of-day', () => {
    expect(startOfDay('2025-01-31').toISOString()).toBe(
      '2025-01-31T00:00:00.000Z'
    )
  })

  it('expands an already-coerced full-datetime start-of-day string to the same instant', () => {
    expect(startOfDay('2025-01-31T00:00:00.000Z').toISOString()).toBe(
      '2025-01-31T00:00:00.000Z'
    )
  })

  it('normalises a full-datetime end-of-day string back to start-of-day for the same calendar date', () => {
    expect(startOfDay('2025-01-31T23:59:59.999Z').toISOString()).toBe(
      '2025-01-31T00:00:00.000Z'
    )
  })
})

describe('endOfDay', () => {
  it('expands a bare date string to UTC end-of-day', () => {
    expect(endOfDay('2025-01-31').toISOString()).toBe(
      '2025-01-31T23:59:59.999Z'
    )
  })

  it('normalises an already-coerced full-datetime start-of-day string to end-of-day for the same calendar date', () => {
    expect(endOfDay('2025-01-31T00:00:00.000Z').toISOString()).toBe(
      '2025-01-31T23:59:59.999Z'
    )
  })

  it('expands a full-datetime end-of-day string to the same instant', () => {
    expect(endOfDay('2025-01-31T23:59:59.999Z').toISOString()).toBe(
      '2025-01-31T23:59:59.999Z'
    )
  })
})

describe('toISOString', () => {
  it('should convert Date object to ISO string', () => {
    const date = new Date('2026-01-20T14:30:00.000Z')
    expect(toISOString(date)).toBe('2026-01-20T14:30:00.000Z')
  })

  it('should return ISO string unchanged when input is already a string', () => {
    const isoString = '2026-01-20T14:30:00.000Z'
    expect(toISOString(isoString)).toBe('2026-01-20T14:30:00.000Z')
  })

  it('should return empty string for null or undefined', () => {
    expect(toISOString(null)).toBe('')
    expect(toISOString(undefined)).toBe('')
  })
})

describe('getMonthNames', () => {
  it('should return array of 12 month names in British English format', () => {
    const monthNames = getMonthNames()

    expect(monthNames).toHaveLength(12)
    expect(monthNames).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sept',
      'Oct',
      'Nov',
      'Dec'
    ])
  })
})

describe('getMonthsOfYear', () => {
  const allMonths = [
    { monthNumber: 1, month: 'Jan' },
    { monthNumber: 2, month: 'Feb' },
    { monthNumber: 3, month: 'Mar' },
    { monthNumber: 4, month: 'Apr' },
    { monthNumber: 5, month: 'May' },
    { monthNumber: 6, month: 'Jun' },
    { monthNumber: 7, month: 'Jul' },
    { monthNumber: 8, month: 'Aug' },
    { monthNumber: 9, month: 'Sept' },
    { monthNumber: 10, month: 'Oct' },
    { monthNumber: 11, month: 'Nov' },
    { monthNumber: 12, month: 'Dec' }
  ]

  it('gives the current year up to the current month', () => {
    expect(getMonthsOfYear(2026, new Date('2026-03-20T14:30:00.000Z'))).toEqual(
      allMonths.slice(0, 3)
    )
  })

  it('gives only January in the current year in January', () => {
    expect(getMonthsOfYear(2026, new Date('2026-01-10T09:00:00.000Z'))).toEqual(
      allMonths.slice(0, 1)
    )
  })

  it.for(
    /** @type {[string, number, string][]} */ ([
      ['a past year', 2026, '2027-03-20T14:30:00.000Z'],
      ['a year opened early', 2027, '2026-11-20T09:00:00.000Z']
    ])
  )('gives every month of %s', ([, year, now]) => {
    expect(getMonthsOfYear(year, new Date(now))).toEqual(allMonths)
  })
})

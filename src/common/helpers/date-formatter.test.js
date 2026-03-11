import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  formatDate,
  formatDateTimeDots,
  toISOString,
  getMonthNames,
  getMonthRange
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

  it('should return empty string for null', () => {
    expect(formatDate(null)).toBe('')
  })
})

describe('formatDateTimeDots', () => {
  it('should format date-time in DD.MM.YY HH:mm format', () => {
    const date = new Date('2026-02-04T14:49:00')
    expect(formatDateTimeDots(date)).toBe('04.02.26 14:49')
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

describe('getMonthRange', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return all 12 months when system date is end of first year', () => {
    vi.setSystemTime(new Date('2026-12-15T10:00:00.000Z'))

    const result = getMonthRange(2026)

    expect(result).toEqual([
      { monthNumber: 1, month: 'Jan', year: 2026 },
      { monthNumber: 2, month: 'Feb', year: 2026 },
      { monthNumber: 3, month: 'Mar', year: 2026 },
      { monthNumber: 4, month: 'Apr', year: 2026 },
      { monthNumber: 5, month: 'May', year: 2026 },
      { monthNumber: 6, month: 'Jun', year: 2026 },
      { monthNumber: 7, month: 'Jul', year: 2026 },
      { monthNumber: 8, month: 'Aug', year: 2026 },
      { monthNumber: 9, month: 'Sept', year: 2026 },
      { monthNumber: 10, month: 'Oct', year: 2026 },
      { monthNumber: 11, month: 'Nov', year: 2026 },
      { monthNumber: 12, month: 'Dec', year: 2026 }
    ])
  })

  it('should handle different start years', () => {
    vi.setSystemTime(new Date('2027-03-20T14:30:00.000Z'))

    const result = getMonthRange(2026)

    expect(result).toEqual([
      { monthNumber: 1, month: 'Jan', year: 2026 },
      { monthNumber: 2, month: 'Feb', year: 2026 },
      { monthNumber: 3, month: 'Mar', year: 2026 },
      { monthNumber: 4, month: 'Apr', year: 2026 },
      { monthNumber: 5, month: 'May', year: 2026 },
      { monthNumber: 6, month: 'Jun', year: 2026 },
      { monthNumber: 7, month: 'Jul', year: 2026 },
      { monthNumber: 8, month: 'Aug', year: 2026 },
      { monthNumber: 9, month: 'Sept', year: 2026 },
      { monthNumber: 10, month: 'Oct', year: 2026 },
      { monthNumber: 11, month: 'Nov', year: 2026 },
      { monthNumber: 12, month: 'Dec', year: 2026 },
      { monthNumber: 1, month: 'Jan', year: 2027 },
      { monthNumber: 2, month: 'Feb', year: 2027 },
      { monthNumber: 3, month: 'Mar', year: 2027 }
    ])
  })

  it('should return only current month when system date is in the start month', () => {
    vi.setSystemTime(new Date('2026-01-10T09:00:00.000Z'))

    const result = getMonthRange(2026)

    expect(result).toEqual([{ monthNumber: 1, month: 'Jan', year: 2026 }])
  })
})

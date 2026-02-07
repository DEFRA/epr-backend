import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDateTimeDots,
  toISOString
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

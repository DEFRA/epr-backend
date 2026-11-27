import { describe, expect, it } from 'vitest'
import { calendarDate } from '#common/helpers/date-formatter.js'
import {
  isFutureDate,
  isFutureMonth,
  isFutureOverseasReceipt
} from './future-dates.js'

const uploadedOn = (instant) => ({ createdAt: new Date(instant) })

const summaryLog = uploadedOn('2026-11-27T10:00:00.000Z')

describe('isFutureDate', () => {
  it.each([
    { date: '2026-11-26', expected: false },
    { date: '2026-11-27', expected: false },
    { date: '2026-11-28', expected: true },
    { date: '2027-01-05', expected: true }
  ])('is $expected for $date', ({ date, expected }) => {
    expect(isFutureDate(calendarDate(date), summaryLog)).toBe(expected)
  })

  it('uses the UK day of upload', () => {
    expect(
      isFutureDate(
        calendarDate('2026-06-01'),
        uploadedOn('2026-05-31T23:30:00.000Z')
      )
    ).toBe(false)
  })
})

describe('isFutureOverseasReceipt', () => {
  it.each([
    { date: '2026-11-27', expected: false },
    { date: '2026-11-28', expected: false },
    { date: '2026-11-29', expected: true }
  ])('is $expected for $date', ({ date, expected }) => {
    expect(isFutureOverseasReceipt(calendarDate(date), summaryLog)).toBe(
      expected
    )
  })

  it('is true for 1 January when uploaded on 31 December', () => {
    expect(
      isFutureOverseasReceipt(
        calendarDate('2027-01-01'),
        uploadedOn('2026-12-31T12:00:00.000Z')
      )
    ).toBe(true)
  })

  it('allows 1 March when uploaded on 28 February', () => {
    expect(
      isFutureOverseasReceipt(
        calendarDate('2026-03-01'),
        uploadedOn('2026-02-28T12:00:00.000Z')
      )
    ).toBe(false)
  })
})

describe('isFutureMonth', () => {
  it.each([
    { month: '2026-10-01', expected: false },
    { month: '2026-11-01', expected: false },
    { month: '2026-12-01', expected: true }
  ])('is $expected for $month', ({ month, expected }) => {
    expect(isFutureMonth(calendarDate(month), summaryLog)).toBe(expected)
  })

  it('uses the UK month of upload', () => {
    expect(
      isFutureMonth(
        calendarDate('2026-06-01'),
        uploadedOn('2026-05-31T23:30:00.000Z')
      )
    ).toBe(false)
  })
})

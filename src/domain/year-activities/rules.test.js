import { afterEach, describe, it, expect } from 'vitest'

import { calendarDate } from '#common/helpers/date-formatter.js'
import { toYear } from '#common/helpers/dates/year.js'
import { config } from '#root/config.js'

import {
  isDecemberWasteOpen,
  isPrnYearOpen,
  isSummaryLogYearOpen,
  prnYearLastOpenDay,
  summaryLogYearLastOpenDay,
  yearActivityState
} from './rules.js'

describe('isSummaryLogYearOpen', () => {
  it.each([
    [2026, '2026-01-01', true],
    [2026, '2027-02-28', true],
    [2026, '2027-03-01', false],
    [2027, '2028-02-29', true],
    [2027, '2028-03-01', false]
  ])('%i on %s -> %s', (year, date, expected) => {
    expect(isSummaryLogYearOpen(toYear(year), calendarDate(date))).toBe(
      expected
    )
  })
})

describe('summaryLogYearLastOpenDay', () => {
  it.each([
    [2026, '2027-02-28'],
    [2027, '2028-02-29']
  ])('%i -> %s', (year, expected) => {
    expect(summaryLogYearLastOpenDay(toYear(year))).toBe(expected)
  })
})

describe('isPrnYearOpen', () => {
  it.each([
    ['2026-01-01', true],
    ['2027-01-31', true],
    ['2027-02-01', false]
  ])('2026 on %s -> %s', (date, expected) => {
    expect(isPrnYearOpen(toYear(2026), calendarDate(date))).toBe(expected)
  })

  it('closes after 31 January of the next year', () => {
    expect(prnYearLastOpenDay(toYear(2026))).toBe('2027-01-31')
  })
})

describe('isDecemberWasteOpen', () => {
  afterEach(() => {
    config.reset('decemberWaste.windowStart')
  })

  it.each([
    ['2026-11-30', false],
    ['2026-12-01', true],
    ['2027-01-31', true],
    ['2027-02-01', false]
  ])('2026 on %s -> %s', (date, expected) => {
    expect(isDecemberWasteOpen(toYear(2026), calendarDate(date))).toBe(expected)
  })

  it('opens on the configured windowStart day', () => {
    config.set('decemberWaste.windowStart', '06-01T00:00')

    expect(isDecemberWasteOpen(toYear(2026), calendarDate('2026-06-01'))).toBe(
      true
    )
  })
})

describe('yearActivityState', () => {
  it.each([
    ['summaryLogs', { open: true, lastOpenDay: '2027-02-28' }],
    ['prns', { open: true, lastOpenDay: '2027-01-31' }],
    [
      'decemberWaste',
      { open: false, firstOpenDay: '2026-12-01', lastOpenDay: '2027-01-31' }
    ]
  ])('%s for 2026 on 23 November 2026', (activity, expected) => {
    expect(
      yearActivityState(
        /** @type {import('./rules.js').YearActivity} */ (activity),
        toYear(2026),
        calendarDate('2026-11-23')
      )
    ).toEqual(expected)
  })
})

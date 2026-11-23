import { afterEach, describe, it, expect } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { config } from '#root/config.js'

import {
  decemberWasteWindow,
  isDecemberWasteWindowOpen,
  isPrnWindowOpen,
  prnWindow,
  summaryLogWindow
} from './rules.js'

/** @param {string} day */
const middayOn = (day) => new Date(`${day}T12:00:00.000Z`)

describe('summaryLogWindow', () => {
  it.each([
    [2026, '2026-01-01', true],
    [2026, '2027-02-28', true],
    [2026, '2027-03-01', false],
    [2027, '2028-02-29', true],
    [2027, '2028-03-01', false]
  ])('%i as of %s is open %s', (summaryLogYear, asOf, open) => {
    expect(summaryLogWindow(toYear(summaryLogYear), middayOn(asOf)).open).toBe(
      open
    )
  })

  it.each([
    [2026, '2027-02-28'],
    [2027, '2028-02-29']
  ])('%i is open until %s', (summaryLogYear, lastOpenDay) => {
    expect(
      summaryLogWindow(toYear(summaryLogYear), middayOn('2026-01-01'))
        .lastOpenDay
    ).toBe(lastOpenDay)
  })
})

describe('isPrnWindowOpen', () => {
  it.each([
    ['2026-01-01', true],
    ['2027-01-31', true],
    ['2027-02-01', false]
  ])('2026 as of %s is open %s', (asOf, open) => {
    expect(isPrnWindowOpen(toYear(2026), middayOn(asOf))).toBe(open)
  })
})

describe('isDecemberWasteWindowOpen', () => {
  afterEach(() => {
    config.reset('decemberWaste.windowStart')
  })

  it.each([
    ['2026-11-30', false],
    ['2026-12-01', true],
    ['2027-01-31', true],
    ['2027-02-01', false]
  ])('2026 as of %s is open %s', (asOf, open) => {
    expect(isDecemberWasteWindowOpen(toYear(2026), middayOn(asOf))).toBe(open)
  })

  it('opens at UK midnight on the configured windowStart day, in BST', () => {
    config.set('decemberWaste.windowStart', '06-01T00:00')

    expect(
      isDecemberWasteWindowOpen(
        toYear(2026),
        new Date('2026-05-31T23:00:00.000Z')
      )
    ).toBe(true)
  })
})

describe('windows for 2026 as of 23 November 2026', () => {
  const asOf = middayOn('2026-11-23')

  it.each([
    [
      'summary logs',
      summaryLogWindow,
      { open: true, lastOpenDay: '2027-02-28' }
    ],
    ['PRNs', prnWindow, { open: true, lastOpenDay: '2027-01-31' }],
    [
      'December Waste',
      decemberWasteWindow,
      { open: false, firstOpenDay: '2026-12-01', lastOpenDay: '2027-01-31' }
    ]
  ])('%s', (_label, windowFor, expected) => {
    expect(windowFor(toYear(2026), asOf)).toStrictEqual(expected)
  })
})

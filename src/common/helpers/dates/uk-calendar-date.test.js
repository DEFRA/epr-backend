import { describe, it, expect } from 'vitest'

import { ukCalendarDate } from './uk-calendar-date.js'

describe('ukCalendarDate', () => {
  it.each([
    ['a GMT instant', '2027-01-31T23:59:59.999Z', '2027-01-31'],
    [
      'a BST instant after UTC midnight',
      '2026-06-30T23:30:00.000Z',
      '2026-07-01'
    ],
    [
      'a BST instant before UTC midnight',
      '2026-06-30T22:59:00.000Z',
      '2026-06-30'
    ]
  ])('%s', (_label, iso, expected) => {
    expect(ukCalendarDate(new Date(iso))).toBe(expected)
  })
})

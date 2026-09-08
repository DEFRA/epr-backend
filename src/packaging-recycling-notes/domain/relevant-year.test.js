import { describe, it, expect } from 'vitest'

import { isBeforeEndOfRelevantYear } from './relevant-year.js'

describe('isBeforeEndOfRelevantYear', () => {
  it.each([
    ['well inside the window', '2026-06-01T00:00:00.000Z', true],
    [
      'midnight at the start of the deadline day',
      '2027-01-31T00:00:00.000Z',
      true
    ],
    ['exactly the deadline instant', '2027-01-31T23:59:59.999Z', true],
    ['one millisecond after the deadline', '2027-02-01T00:00:00.000Z', false],
    ['well after the deadline', '2027-03-01T00:00:00.000Z', false]
  ])('%s -> %s', (_label, isoNow, expected) => {
    expect(isBeforeEndOfRelevantYear(2026, new Date(isoNow))).toBe(expected)
  })

  it('holds across a leap year boundary', () => {
    expect(
      isBeforeEndOfRelevantYear(2027, new Date('2028-01-31T23:59:59.999Z'))
    ).toBe(true)
    expect(
      isBeforeEndOfRelevantYear(2027, new Date('2028-02-01T00:00:00.000Z'))
    ).toBe(false)
  })

  it('throws for a non-finite relevant year', () => {
    const now = new Date('2026-06-01T00:00:00.000Z')
    expect(() => isBeforeEndOfRelevantYear(NaN, now)).toThrow(TypeError)
    expect(() =>
      isBeforeEndOfRelevantYear(
        /** @type {number} */ (/** @type {*} */ (undefined)),
        now
      )
    ).toThrow(TypeError)
    expect(() =>
      isBeforeEndOfRelevantYear(
        /** @type {number} */ (/** @type {*} */ (null)),
        now
      )
    ).toThrow(TypeError)
  })
})

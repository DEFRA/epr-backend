import { describe, expect, it } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'

import {
  isBeforeCorrectionDeadline,
  lastCorrectionDay
} from './correction-deadline.js'

const ACCREDITED = { registeredOnly: false }
const REGISTERED_ONLY = { registeredOnly: true }

describe('lastCorrectionDay', () => {
  it.each([
    [2026, ACCREDITED, '2027-02-27'],
    [2027, ACCREDITED, '2028-02-27'],
    [2026, REGISTERED_ONLY, '2027-03-20'],
    [2027, REGISTERED_ONLY, '2028-03-20']
  ])('%i for %o is %s', (year, registration, expected) => {
    expect(lastCorrectionDay(toYear(year), registration)).toBe(expected)
  })
})

describe('isBeforeCorrectionDeadline', () => {
  it.each([
    [ACCREDITED, '2027-01-10T09:00:00.000Z', true],
    [ACCREDITED, '2027-02-27T23:59:59.999Z', true],
    [ACCREDITED, '2027-02-28T00:00:00.000Z', false],
    [REGISTERED_ONLY, '2027-02-28T00:00:00.000Z', true],
    [REGISTERED_ONLY, '2027-03-20T23:59:59.999Z', true],
    [REGISTERED_ONLY, '2027-03-21T00:00:00.000Z', false]
  ])('2026 for %o at %s is %s', (registration, at, expected) => {
    expect(
      isBeforeCorrectionDeadline(toYear(2026), registration, new Date(at))
    ).toBe(expected)
  })
})

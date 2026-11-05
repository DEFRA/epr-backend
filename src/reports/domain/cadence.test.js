import { describe, expect, it } from 'vitest'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import {
  CADENCE,
  MONTHS_PER_PERIOD,
  cadenceAccreditationFor
} from './cadence.js'

const ACCREDITATION_NUMBER = toAccreditationNumber('A26ER5000000001PA')

describe('cadenceAccreditationFor', () => {
  it('reports monthly for the accreditation', () => {
    expect(
      cadenceAccreditationFor(CADENCE.monthly, ACCREDITATION_NUMBER)
    ).toStrictEqual({
      cadence: CADENCE.monthly,
      accreditationNumber: ACCREDITATION_NUMBER
    })
  })

  it('reports quarterly as registered-only, whatever the accreditation', () => {
    expect(
      cadenceAccreditationFor(CADENCE.quarterly, ACCREDITATION_NUMBER)
    ).toStrictEqual({ cadence: CADENCE.quarterly, accreditationNumber: null })
  })

  it('refuses a monthly report without an accreditation number', () => {
    for (const missing of [null, undefined]) {
      expect(() => cadenceAccreditationFor(CADENCE.monthly, missing)).toThrow(
        'A monthly report needs an accreditation number'
      )
    }
  })
})

describe('CADENCE', () => {
  it('has monthly and quarterly values', () => {
    expect(CADENCE.monthly).toBe('monthly')
    expect(CADENCE.quarterly).toBe('quarterly')
  })

  it('is frozen', () => {
    expect(Object.isFrozen(CADENCE)).toBe(true)
  })
})

describe('MONTHS_PER_PERIOD', () => {
  it('monthly has 1 month per period', () => {
    expect(MONTHS_PER_PERIOD.monthly).toBe(1)
  })

  it('quarterly has 3 months per period', () => {
    expect(MONTHS_PER_PERIOD.quarterly).toBe(3)
  })

  it('is frozen', () => {
    expect(Object.isFrozen(MONTHS_PER_PERIOD)).toBe(true)
  })

  it('has an entry for each cadence', () => {
    for (const key of Object.values(CADENCE)) {
      expect(MONTHS_PER_PERIOD[key]).toBeDefined()
    }
  })
})

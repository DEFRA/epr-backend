import { describe, expect, it } from 'vitest'

import { PRN_STATUS } from './model.js'
import { RelevantYearWindowExpiredError } from './relevant-year.js'
import {
  ISSUANCE_WINDOW_CLOSED_CODE,
  assertIssuanceWindowOpen,
  issuanceWindowRefusal
} from './issuance-window.js'

const ACCREDITATION_YEAR = 2026
const INSIDE_WINDOW = new Date('2026-06-15T12:00:00.000Z')
const LAST_INSTANT = new Date('2027-01-31T23:59:59.999Z')
const AFTER_WINDOW = new Date('2027-02-01T00:00:00.000Z')

describe('issuanceWindowRefusal', () => {
  /** @type {Array<[import('./model.js').PrnStatus, import('./model.js').PrnStatus]>} */
  const gatedTransitions = [
    [PRN_STATUS.DRAFT, PRN_STATUS.AWAITING_AUTHORISATION],
    [PRN_STATUS.AWAITING_AUTHORISATION, PRN_STATUS.AWAITING_ACCEPTANCE]
  ]

  /** @type {Array<[import('./model.js').PrnStatus, import('./model.js').PrnStatus]>} */
  const openTransitions = [
    [PRN_STATUS.DRAFT, PRN_STATUS.DISCARDED],
    [PRN_STATUS.AWAITING_AUTHORISATION, PRN_STATUS.DELETED],
    [PRN_STATUS.AWAITING_ACCEPTANCE, PRN_STATUS.ACCEPTED],
    [PRN_STATUS.AWAITING_ACCEPTANCE, PRN_STATUS.AWAITING_CANCELLATION],
    [PRN_STATUS.AWAITING_ACCEPTANCE, PRN_STATUS.CANCELLED],
    [PRN_STATUS.AWAITING_CANCELLATION, PRN_STATUS.CANCELLED],
    [PRN_STATUS.ACCEPTED, PRN_STATUS.CANCELLED]
  ]

  it.each(gatedTransitions)(
    'refuses %s -> %s after 31 January of the following year',
    (from, to) => {
      const refusal = issuanceWindowRefusal(
        from,
        to,
        ACCREDITATION_YEAR,
        AFTER_WINDOW
      )

      expect(refusal).toBeInstanceOf(RelevantYearWindowExpiredError)
    }
  )

  it.each(gatedTransitions)(
    'permits %s -> %s at the last instant of 31 January',
    (from, to) => {
      expect(
        issuanceWindowRefusal(from, to, ACCREDITATION_YEAR, LAST_INSTANT)
      ).toBeUndefined()
    }
  )

  it.each(gatedTransitions)(
    'permits %s -> %s inside the accreditation year',
    (from, to) => {
      expect(
        issuanceWindowRefusal(from, to, ACCREDITATION_YEAR, INSIDE_WINDOW)
      ).toBeUndefined()
    }
  )

  it.each(openTransitions)(
    'leaves %s -> %s open after the window closes',
    (from, to) => {
      expect(
        issuanceWindowRefusal(from, to, ACCREDITATION_YEAR, AFTER_WINDOW)
      ).toBeUndefined()
    }
  )
})

describe('assertIssuanceWindowOpen', () => {
  const accreditation = { id: 'acc-789', validFrom: '2026-01-01' }

  it('no-ops while the window is open', () => {
    expect(() =>
      assertIssuanceWindowOpen({ accreditation, now: LAST_INSTANT })
    ).not.toThrow()
  })

  it('throws a 409 carrying the machine-readable code after the window closes', () => {
    let thrown
    try {
      assertIssuanceWindowOpen({ accreditation, now: AFTER_WINDOW })
    } catch (error) {
      thrown = error
    }

    expect(thrown.isBoom).toBe(true)
    expect(thrown.output.statusCode).toBe(409)
    expect(thrown.output.payload.code).toBe(ISSUANCE_WINDOW_CLOSED_CODE)
  })
})

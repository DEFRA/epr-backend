import { describe, expect, it } from 'vitest'
import { PRN_STATUS } from './model.js'
import { aggregateIssuedTonnage } from './tonnage.js'

const PERIOD_START = new Date('2025-03-01T00:00:00Z')
const PERIOD_END = new Date('2025-03-31T23:59:59Z')

const FEB = new Date('2025-02-15T09:00:00Z')
const MAR = new Date('2025-03-15T09:00:00Z')
const APR = new Date('2025-04-15T09:00:00Z')

const ACTOR = { id: 'u', name: 'U' }

const params = {
  startDate: PERIOD_START,
  endDate: PERIOD_END
}

/**
 * @param {string} id
 * @param {number} tonnage
 * @param {object} status
 * @returns {import('./model.js').PackagingRecyclingNote}
 */
function buildPrn(id, tonnage, status) {
  return /** @type {import('./model.js').PackagingRecyclingNote} */ ({
    id,
    tonnage,
    status
  })
}

describe('aggregateIssuedTonnage', () => {
  describe('accepted PRNs', () => {
    it('includes PRN created and issued within the period', () => {
      const prn = buildPrn('prn-1', 50, {
        currentStatus: PRN_STATUS.ACCEPTED,
        currentStatusAt: MAR,
        created: { at: MAR, by: ACTOR },
        issued: { at: MAR, by: ACTOR },
        accepted: { at: MAR, by: ACTOR }
      })

      expect(aggregateIssuedTonnage([prn], params)).toBe(50)
    })

    it('includes PRN created before the period but issued within it', () => {
      const prn = buildPrn('prn-1', 50, {
        currentStatus: PRN_STATUS.ACCEPTED,
        currentStatusAt: MAR,
        created: { at: FEB, by: ACTOR },
        issued: { at: MAR, by: ACTOR },
        accepted: { at: MAR, by: ACTOR }
      })

      expect(aggregateIssuedTonnage([prn], params)).toBe(50)
    })

    it('includes PRN created before the period, issued within it, accepted after it', () => {
      const prn = buildPrn('prn-1', 50, {
        currentStatus: PRN_STATUS.ACCEPTED,
        currentStatusAt: APR,
        created: { at: FEB, by: ACTOR },
        issued: { at: MAR, by: ACTOR },
        accepted: { at: APR, by: ACTOR }
      })

      expect(aggregateIssuedTonnage([prn], params)).toBe(50)
    })

    it('includes PRN created and issued within the period but accepted after it', () => {
      const prn = buildPrn('prn-1', 50, {
        currentStatus: PRN_STATUS.ACCEPTED,
        currentStatusAt: APR,
        created: { at: MAR, by: ACTOR },
        issued: { at: MAR, by: ACTOR },
        accepted: { at: APR, by: ACTOR }
      })

      expect(aggregateIssuedTonnage([prn], params)).toBe(50)
    })
  })

  describe('cancelled PRNs', () => {
    const cancelledParams = params

    it('includes PRN created before the period, issued within it, cancelled after it', () => {
      const prn = buildPrn('prn-1', 75, {
        currentStatus: PRN_STATUS.CANCELLED,
        currentStatusAt: APR,
        created: { at: FEB, by: ACTOR },
        issued: { at: MAR, by: ACTOR },
        rejected: { at: APR, by: ACTOR },
        cancelled: { at: APR, by: ACTOR }
      })

      expect(aggregateIssuedTonnage([prn], cancelledParams)).toBe(75)
    })

    it('includes PRN created and issued within the period but cancelled after it', () => {
      const prn = buildPrn('prn-1', 75, {
        currentStatus: PRN_STATUS.CANCELLED,
        currentStatusAt: APR,
        created: { at: MAR, by: ACTOR },
        issued: { at: MAR, by: ACTOR },
        rejected: { at: APR, by: ACTOR },
        cancelled: { at: APR, by: ACTOR }
      })

      expect(aggregateIssuedTonnage([prn], cancelledParams)).toBe(75)
    })
  })

  it('excludes PRN with no issued.at (not yet issued)', () => {
    const prn = buildPrn('prn-1', 50, {
      currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      currentStatusAt: MAR,
      created: { at: MAR, by: ACTOR }
    })

    expect(aggregateIssuedTonnage([prn], params)).toBe(0)
  })

  it('excludes PRN whose issued.at falls before the period', () => {
    const prn = buildPrn('prn-1', 100, {
      currentStatus: PRN_STATUS.ACCEPTED,
      currentStatusAt: FEB,
      created: { at: FEB, by: ACTOR },
      issued: { at: FEB, by: ACTOR },
      accepted: { at: FEB, by: ACTOR }
    })

    expect(aggregateIssuedTonnage([prn], params)).toBe(0)
  })

  it('sums tonnage across multiple qualifying PRNs', () => {
    const prns = [
      buildPrn('prn-1', 30, {
        currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        currentStatusAt: MAR,
        created: { at: FEB, by: ACTOR },
        issued: { at: MAR, by: ACTOR }
      }),
      buildPrn('prn-2', 20, {
        currentStatus: PRN_STATUS.ACCEPTED,
        currentStatusAt: APR,
        created: { at: MAR, by: ACTOR },
        issued: { at: MAR, by: ACTOR },
        accepted: { at: APR, by: ACTOR }
      })
    ]

    expect(aggregateIssuedTonnage(prns, params)).toBe(50)
  })

  it('returns 0 for empty PRN list', () => {
    expect(aggregateIssuedTonnage([], params)).toBe(0)
  })
})

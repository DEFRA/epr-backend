import { describe, expect, it } from 'vitest'
import { PRN_STATUS } from './model.js'
import { aggregateIssuedTonnage } from './tonnage.js'

const PERIOD_START = new Date('2025-01-01T00:00:00Z')
const PERIOD_END = new Date('2025-12-31T23:59:59Z')

// Pre-period timestamps for early lifecycle steps
const DRAFTED_AT = new Date('2024-11-01T09:00:00Z')
const AUTHORISED_AT = new Date('2024-12-01T09:00:00Z')

// In-period timestamps
const ISSUED_AT = new Date('2025-02-01T09:00:00Z')
const ACCEPTED_AT = new Date('2025-02-02T09:00:00Z')
const REJECTED_AT = new Date('2025-02-03T09:00:00Z')

const ACTOR = { id: 'u', name: 'U' }

const QUALIFYING_STATUSES = [
  PRN_STATUS.AWAITING_ACCEPTANCE,
  PRN_STATUS.ACCEPTED
]
const params = {
  startDate: PERIOD_START,
  endDate: PERIOD_END,
  statuses: QUALIFYING_STATUSES
}

/**
 * Builds the standard pre-period history steps (draft → awaiting_authorisation).
 * @returns {import('./model.js').PrnStatusHistoryItem[]}
 */
function preIssuanceHistory() {
  return [
    { status: PRN_STATUS.DRAFT, at: DRAFTED_AT, by: ACTOR },
    { status: PRN_STATUS.AWAITING_AUTHORISATION, at: AUTHORISED_AT, by: ACTOR }
  ]
}

/**
 * @param {string} id
 * @param {number} tonnage
 * @param {import('./model.js').PackagingRecyclingNote['status']} status
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
  it('includes PRN whose latest in-period entry is awaiting_acceptance', () => {
    const prn = buildPrn('prn-1', 50, {
      currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      currentStatusAt: ISSUED_AT,
      history: [
        ...preIssuanceHistory(),
        { status: PRN_STATUS.AWAITING_ACCEPTANCE, at: ISSUED_AT, by: ACTOR }
      ]
    })

    expect(aggregateIssuedTonnage([prn], params)).toBe(50)
  })

  it('includes PRN whose latest in-period entry is accepted', () => {
    const prn = buildPrn('prn-1', 75, {
      currentStatus: PRN_STATUS.ACCEPTED,
      currentStatusAt: ACCEPTED_AT,
      history: [
        ...preIssuanceHistory(),
        { status: PRN_STATUS.AWAITING_ACCEPTANCE, at: ISSUED_AT, by: ACTOR },
        { status: PRN_STATUS.ACCEPTED, at: ACCEPTED_AT, by: ACTOR }
      ]
    })

    expect(aggregateIssuedTonnage([prn], params)).toBe(75)
  })

  it('excludes PRN whose latest in-period entry is awaiting_cancellation', () => {
    const prn = buildPrn('prn-1', 50, {
      currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
      currentStatusAt: REJECTED_AT,
      history: [
        ...preIssuanceHistory(),
        { status: PRN_STATUS.AWAITING_ACCEPTANCE, at: ISSUED_AT, by: ACTOR },
        { status: PRN_STATUS.AWAITING_CANCELLATION, at: REJECTED_AT, by: ACTOR }
      ]
    })

    expect(aggregateIssuedTonnage([prn], params)).toBe(0)
  })

  it('excludes PRN whose entire history falls before the period', () => {
    const prn = buildPrn('prn-1', 100, {
      currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      currentStatusAt: AUTHORISED_AT,
      history: [
        { status: PRN_STATUS.DRAFT, at: DRAFTED_AT, by: ACTOR },
        {
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          at: AUTHORISED_AT,
          by: ACTOR
        }
      ]
    })

    expect(aggregateIssuedTonnage([prn], params)).toBe(0)
  })

  it('sums tonnage across multiple qualifying PRNs', () => {
    const prns = [
      buildPrn('prn-1', 30, {
        currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        currentStatusAt: ISSUED_AT,
        history: [
          ...preIssuanceHistory(),
          { status: PRN_STATUS.AWAITING_ACCEPTANCE, at: ISSUED_AT, by: ACTOR }
        ]
      }),
      buildPrn('prn-2', 20, {
        currentStatus: PRN_STATUS.ACCEPTED,
        currentStatusAt: ACCEPTED_AT,
        history: [
          ...preIssuanceHistory(),
          { status: PRN_STATUS.AWAITING_ACCEPTANCE, at: ISSUED_AT, by: ACTOR },
          { status: PRN_STATUS.ACCEPTED, at: ACCEPTED_AT, by: ACTOR }
        ]
      })
    ]

    expect(aggregateIssuedTonnage(prns, params)).toBe(50)
  })

  it('uses the latest in-period entry to determine inclusion', () => {
    // PRN issued then rejected within the same period — latest entry is awaiting_cancellation
    const prn = buildPrn('prn-1', 75, {
      currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
      currentStatusAt: REJECTED_AT,
      history: [
        ...preIssuanceHistory(),
        { status: PRN_STATUS.AWAITING_ACCEPTANCE, at: ISSUED_AT, by: ACTOR },
        { status: PRN_STATUS.AWAITING_CANCELLATION, at: REJECTED_AT, by: ACTOR }
      ]
    })

    expect(aggregateIssuedTonnage([prn], params)).toBe(0)
  })

  it('returns 0 for empty PRN list', () => {
    expect(aggregateIssuedTonnage([], params)).toBe(0)
  })
})

import { describe, it, expect } from 'vitest'

import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { ledgerEventsResponseSchema } from './ledger-events-response.schema.js'

const commonKeys = () => ({
  number: 1,
  createdAt: new Date('2026-01-15T10:00:00.000Z'),
  createdBy: { id: 'user-1', name: 'Jo Sample', email: 'jo@example.com' },
  balance: {
    opening: { total: 0, available: 0 },
    closing: { total: 100, available: 100 }
  }
})

const summaryLogEvent = (overrides = {}) => ({
  ...commonKeys(),
  kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
  summaryLog: { id: 'log-1', creditTotal: 100 },
  ...overrides
})

const prnEvent = (overrides = {}) => ({
  ...commonKeys(),
  kind: LEDGER_EVENT_KIND.PRN_CREATED,
  prn: { id: 'prn-1', tonnage: 50 },
  ...overrides
})

/**
 * @param {unknown[]} events
 * @param {string | null} [accreditationId]
 */
const ledgerOf = (events, accreditationId = 'acc-1') => ({
  ledger: {
    organisationId: 'org-1',
    registrationId: 'reg-1',
    accreditationId
  },
  events
})

/** @param {unknown} value */
const errorFrom = (value) =>
  ledgerEventsResponseSchema.validate(value).error?.message

/**
 * An event is one of two whole shapes, so a refusal names the shape that came
 * closest rather than the key at fault. Both shapes' complaints together do
 * name it.
 *
 * @param {unknown} event
 */
const refusalOf = (event) => {
  const { error } = ledgerEventsResponseSchema.validate(ledgerOf([event]))
  const arms = /** @type {Array<{ message: string }>} */ (
    error?.details[0]?.context?.details ?? []
  )

  return arms.map((arm) => arm.message).join(' ')
}

describe('the waste balance ledger response schema', () => {
  it('accepts an event that credits a summary log', () => {
    expect(errorFrom(ledgerOf([summaryLogEvent()]))).toBeUndefined()
  })

  it('accepts an event that concerns a note', () => {
    expect(errorFrom(ledgerOf([prnEvent()]))).toBeUndefined()
  })

  it('accepts a ledger holding no events', () => {
    expect(errorFrom(ledgerOf([]))).toBeUndefined()
  })

  it('accepts an actor the ledger knows only the id of', () => {
    const event = summaryLogEvent({ createdBy: { id: 'system' } })

    expect(errorFrom(ledgerOf([event]))).toBeUndefined()
  })

  it('names the registered-only ledger by a null accreditation', () => {
    expect(errorFrom(ledgerOf([], null))).toBeUndefined()
  })

  it('refuses an event that names both a summary log and a note', () => {
    const event = summaryLogEvent({ prn: { id: 'prn-1', tonnage: 50 } })

    expect(refusalOf(event)).toContain('"events[0].prn" is not allowed')
    expect(
      refusalOf({ ...event, kind: LEDGER_EVENT_KIND.PRN_CREATED })
    ).toContain('"events[0].summaryLog" is not allowed')
  })

  it('refuses a summary log event that names no log', () => {
    const event = {
      ...commonKeys(),
      kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
    }

    expect(refusalOf(event)).toContain('"events[0].summaryLog" is required')
  })

  it('refuses a PRN event that names no note', () => {
    const event = { ...commonKeys(), kind: LEDGER_EVENT_KIND.PRN_CREATED }

    expect(refusalOf(event)).toContain('"events[0].prn" is required')
  })

  it('refuses a summary log subject under a kind that concerns a note', () => {
    const event = summaryLogEvent({ kind: LEDGER_EVENT_KIND.PRN_ISSUED })

    expect(refusalOf(event)).toContain('"events[0].prn" is required')
  })

  it('refuses a kind neither shape claims', () => {
    const event = summaryLogEvent({ kind: 'ledger-rebuilt' })

    expect(refusalOf(event)).toContain('"events[0].kind" must be')
  })

  it.each(['organisationId', 'registrationId', 'accreditationId'])(
    'refuses an event that repeats the ledger id %s',
    (field) => {
      const event = summaryLogEvent({ [field]: 'ledger-id' })

      expect(refusalOf(event)).toContain(`"events[0].${field}" is not allowed`)
    }
  )

  it('refuses an event that hands out its storage id', () => {
    const event = summaryLogEvent({ id: 'stored-event-1' })

    expect(refusalOf(event)).toContain('"events[0].id" is not allowed')
  })

  it('refuses an event that hands out the stored payload', () => {
    const event = summaryLogEvent({
      payload: { summaryLogId: 'log-1', creditTotal: 100 }
    })

    expect(refusalOf(event)).toContain('"events[0].payload" is not allowed')
  })

  it('refuses a balance stated in the words the store uses', () => {
    const event = summaryLogEvent({
      balance: {
        opening: { amount: 0, availableAmount: 0 },
        closing: { total: 100, available: 100 }
      }
    })

    expect(refusalOf(event)).toContain(
      '"events[0].balance.opening.total" is required'
    )
  })

  it('refuses an envelope carrying a field of its own', () => {
    expect(errorFrom({ ...ledgerOf([]), cursor: 'abc' })).toContain('cursor')
  })
})

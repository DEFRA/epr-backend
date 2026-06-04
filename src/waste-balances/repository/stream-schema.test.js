import { describe, it, expect } from 'vitest'

import { streamEventInsertSchema, STREAM_EVENT_KIND } from './stream-schema.js'
import {
  buildStreamEvent,
  buildPrnCreatedEvent,
  buildPrnIssuedEvent,
  buildPrnCreationCancelledEvent,
  buildPrnCancelledAfterIssueEvent,
  buildPrnAcceptedEvent,
  buildPrnRejectedEvent
} from './stream-test-data.js'
import {
  validateStreamEventInsert,
  validateStreamEventRead
} from './stream-validation.js'

const validate = (data) =>
  streamEventInsertSchema.validate(data, {
    abortEarly: false,
    stripUnknown: true
  })

describe('stream event insert schema', () => {
  it('accepts a valid summary-log-submitted event', () => {
    const { error } = validate(buildStreamEvent())
    expect(error).toBeUndefined()
  })

  it('accepts a valid prn-created event', () => {
    const { error } = validate(buildPrnCreatedEvent())
    expect(error).toBeUndefined()
  })

  it('accepts a valid prn-issued event', () => {
    const { error } = validate(
      buildStreamEvent({
        kind: STREAM_EVENT_KIND.PRN_ISSUED,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    )
    expect(error).toBeUndefined()
  })

  it('accepts a valid prn-creation-cancelled event', () => {
    const { error } = validate(
      buildStreamEvent({
        kind: STREAM_EVENT_KIND.PRN_CREATION_CANCELLED,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    )
    expect(error).toBeUndefined()
  })

  it('accepts a valid prn-cancelled-after-issue event', () => {
    const { error } = validate(
      buildStreamEvent({
        kind: STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    )
    expect(error).toBeUndefined()
  })

  it('accepts a valid prn-accepted event', () => {
    const { error } = validate(
      buildStreamEvent({
        kind: STREAM_EVENT_KIND.PRN_ACCEPTED,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    )
    expect(error).toBeUndefined()
  })

  it('accepts a valid prn-rejected event', () => {
    const { error } = validate(
      buildStreamEvent({
        kind: STREAM_EVENT_KIND.PRN_REJECTED,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    )
    expect(error).toBeUndefined()
  })

  it('rejects unknown kind values', () => {
    const { error } = validate(buildStreamEvent({ kind: 'unknown-kind' }))
    expect(error).toBeDefined()
  })

  it('rejects missing required top-level fields', () => {
    const { error } = validate({})
    expect(error).toBeDefined()
    const missingFields = error?.details.map((d) => d.path[0])
    expect(missingFields).toContain('registrationId')
    expect(missingFields).toContain('number')
    expect(missingFields).toContain('kind')
    expect(missingFields).toContain('openingBalance')
    expect(missingFields).toContain('closingBalance')
    expect(missingFields).toContain('createdAt')
    expect(missingFields).toContain('createdBy')
  })

  it('rejects mismatched kind/payload — prn-created with summaryLogId payload', () => {
    const { error } = validate(
      buildStreamEvent({
        kind: STREAM_EVENT_KIND.PRN_CREATED,
        payload: { summaryLogId: 'log-1', creditTotal: 100 }
      })
    )
    expect(error).toBeDefined()
  })

  it('rejects mismatched kind/payload — summary-log-submitted with prnId payload', () => {
    const { error } = validate(
      buildStreamEvent({
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    )
    expect(error).toBeDefined()
  })

  it('preserves email on createdBy', () => {
    const { value } = validate(
      buildStreamEvent({
        createdBy: {
          id: 'user-1',
          name: 'Test User',
          email: 'user@example.test'
        }
      })
    )
    expect(value.createdBy.email).toBe('user@example.test')
  })

  it('accepts createdBy without name', () => {
    const { error } = validate(
      buildStreamEvent({
        createdBy: { id: 'user-1', email: 'user@example.test' }
      })
    )
    expect(error).toBeUndefined()
  })

  it('accepts createdBy with id only — no name, no email', () => {
    const { error } = validate(
      buildStreamEvent({ createdBy: { id: 'user-1' } })
    )
    expect(error).toBeUndefined()
  })

  it('accepts accreditationId: null for registered-only streams', () => {
    const { error } = validate(buildStreamEvent({ accreditationId: null }))
    expect(error).toBeUndefined()
  })

  it('rejects PRN kinds when accreditationId is null', () => {
    const { error } = validate(
      buildStreamEvent({
        accreditationId: null,
        kind: STREAM_EVENT_KIND.PRN_CREATED,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    )
    expect(error).toBeDefined()
  })

  it('rejects prn-accepted when accreditationId is null', () => {
    const { error } = validate(
      buildStreamEvent({
        accreditationId: null,
        kind: STREAM_EVENT_KIND.PRN_ACCEPTED,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    )
    expect(error).toBeDefined()
  })

  it('rejects prn-rejected when accreditationId is null', () => {
    const { error } = validate(
      buildStreamEvent({
        accreditationId: null,
        kind: STREAM_EVENT_KIND.PRN_REJECTED,
        payload: { prnId: 'prn-1', amount: 50 }
      })
    )
    expect(error).toBeDefined()
  })

  it('rejects number less than 1', () => {
    const { error } = validate(buildStreamEvent({ number: 0 }))
    expect(error).toBeDefined()
  })

  it('accepts closing balance with zero values', () => {
    const { error } = validate(
      buildStreamEvent({
        closingBalance: { amount: 0, availableAmount: 0 }
      })
    )
    expect(error).toBeUndefined()
  })

  it('accepts convenience builder output for prn-issued', () => {
    const { error } = validate(buildPrnIssuedEvent())
    expect(error).toBeUndefined()
  })

  it('accepts convenience builder output for prn-creation-cancelled', () => {
    const { error } = validate(buildPrnCreationCancelledEvent())
    expect(error).toBeUndefined()
  })

  it('accepts convenience builder output for prn-cancelled-after-issue', () => {
    const { error } = validate(buildPrnCancelledAfterIssueEvent())
    expect(error).toBeUndefined()
  })

  it('accepts convenience builder output for prn-accepted', () => {
    const { error } = validate(buildPrnAcceptedEvent())
    expect(error).toBeUndefined()
  })

  it('accepts convenience builder output for prn-rejected', () => {
    const { error } = validate(buildPrnRejectedEvent())
    expect(error).toBeUndefined()
  })
})

describe('stream event validation', () => {
  describe('validateStreamEventInsert', () => {
    it('returns the validated event for valid input', () => {
      const event = buildStreamEvent()
      const result = validateStreamEventInsert(event)
      expect(result.registrationId).toBe(event.registrationId)
    })

    it('throws Boom.badData for invalid input', () => {
      expect(() => validateStreamEventInsert({})).toThrow(
        /Invalid stream event data/
      )
    })
  })

  describe('validateStreamEventRead', () => {
    it('returns the validated event for valid input with id', () => {
      const event = { id: 'evt-1', ...buildStreamEvent() }
      const result = validateStreamEventRead(event)
      expect(result.id).toBe('evt-1')
    })

    it('throws Boom.badImplementation for invalid input', () => {
      expect(() => validateStreamEventRead({ id: 'bad' })).toThrow(
        /Invalid stream event/
      )
    })
  })
})

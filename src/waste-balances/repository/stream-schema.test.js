import { describe, it, expect } from 'vitest'

import {
  streamEventInsertSchema,
  STREAM_EVENT_KIND
} from './stream-schema.js'
import { buildStreamEvent, buildPrnCreatedEvent } from './stream-test-data.js'

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

  it('rejects unknown kind values', () => {
    const { error } = validate(
      buildStreamEvent({ kind: 'unknown-kind' })
    )
    expect(error).toBeDefined()
  })

  it('rejects missing required top-level fields', () => {
    const { error } = validate({})
    expect(error).toBeDefined()
    const missingFields = error.details.map((d) => d.path[0])
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

  it('accepts accreditationId: null for registered-only streams', () => {
    const { error } = validate(
      buildStreamEvent({ accreditationId: null })
    )
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
})

import { describe, it, expect } from 'vitest'

import {
  PRN_STATUS,
  PRN_STATUS_TRANSITIONS,
  PRN_ACTOR,
  isValidTransition,
  validateTransition,
  StatusConflictError,
  UnauthorisedTransitionError
} from './model.js'

describe('PRN_STATUS_TRANSITIONS', () => {
  it('has empty array for terminal states', () => {
    expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.ACCEPTED]).toEqual([])
    expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.CANCELLED]).toEqual([])
    expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.DELETED]).toEqual([])
    expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.DISCARDED]).toEqual([])
  })

  it.each([
    [
      PRN_STATUS.DRAFT,
      PRN_STATUS.AWAITING_AUTHORISATION,
      PRN_ACTOR.REPROCESSOR_EXPORTER
    ],
    [PRN_STATUS.DRAFT, PRN_STATUS.DISCARDED, PRN_ACTOR.REPROCESSOR_EXPORTER],
    [
      PRN_STATUS.AWAITING_AUTHORISATION,
      PRN_STATUS.AWAITING_ACCEPTANCE,
      PRN_ACTOR.SIGNATORY
    ],
    [
      PRN_STATUS.AWAITING_AUTHORISATION,
      PRN_STATUS.DELETED,
      PRN_ACTOR.SIGNATORY
    ],
    [PRN_STATUS.AWAITING_ACCEPTANCE, PRN_STATUS.ACCEPTED, PRN_ACTOR.PRODUCER],
    [
      PRN_STATUS.AWAITING_ACCEPTANCE,
      PRN_STATUS.AWAITING_CANCELLATION,
      PRN_ACTOR.PRODUCER
    ],
    [
      PRN_STATUS.AWAITING_CANCELLATION,
      PRN_STATUS.CANCELLED,
      PRN_ACTOR.SIGNATORY
    ]
  ])('allows %s -> %s for %s', (from, to, actor) => {
    expect(isValidTransition(from, to, actor)).toBe(true)
  })

  it.each([
    [PRN_STATUS.DRAFT, PRN_STATUS.AWAITING_AUTHORISATION, PRN_ACTOR.SIGNATORY],
    [PRN_STATUS.DRAFT, PRN_STATUS.AWAITING_AUTHORISATION, PRN_ACTOR.PRODUCER],
    [
      PRN_STATUS.AWAITING_AUTHORISATION,
      PRN_STATUS.AWAITING_ACCEPTANCE,
      PRN_ACTOR.REPROCESSOR_EXPORTER
    ],
    [
      PRN_STATUS.AWAITING_AUTHORISATION,
      PRN_STATUS.AWAITING_ACCEPTANCE,
      PRN_ACTOR.PRODUCER
    ],
    [PRN_STATUS.AWAITING_ACCEPTANCE, PRN_STATUS.ACCEPTED, PRN_ACTOR.SIGNATORY],
    [
      PRN_STATUS.AWAITING_ACCEPTANCE,
      PRN_STATUS.ACCEPTED,
      PRN_ACTOR.REPROCESSOR_EXPORTER
    ],
    [PRN_STATUS.DRAFT, PRN_STATUS.ACCEPTED, PRN_ACTOR.PRODUCER],
    [PRN_STATUS.ACCEPTED, PRN_STATUS.DRAFT, PRN_ACTOR.PRODUCER],
    ['unknown', PRN_STATUS.DRAFT, PRN_ACTOR.PRODUCER]
  ])('rejects %s -> %s for %s', (from, to, actor) => {
    expect(isValidTransition(from, to, actor)).toBe(false)
  })
})

describe('validateTransition', () => {
  it('does not throw for valid transitions', () => {
    expect(() =>
      validateTransition(
        PRN_STATUS.AWAITING_ACCEPTANCE,
        PRN_STATUS.ACCEPTED,
        PRN_ACTOR.PRODUCER
      )
    ).not.toThrow()
  })

  it('throws StatusConflictError when no transition exists from current to new status', () => {
    expect(() =>
      validateTransition(
        PRN_STATUS.ACCEPTED,
        PRN_STATUS.DRAFT,
        PRN_ACTOR.PRODUCER
      )
    ).toThrow(StatusConflictError)
  })

  it('throws StatusConflictError for terminal states', () => {
    expect(() =>
      validateTransition(
        PRN_STATUS.CANCELLED,
        PRN_STATUS.ACCEPTED,
        PRN_ACTOR.PRODUCER
      )
    ).toThrow(StatusConflictError)
  })

  it('throws UnauthorisedTransitionError when transition exists but actor is not permitted', () => {
    expect(() =>
      validateTransition(
        PRN_STATUS.AWAITING_ACCEPTANCE,
        PRN_STATUS.ACCEPTED,
        PRN_ACTOR.SIGNATORY
      )
    ).toThrow(UnauthorisedTransitionError)
  })

  it('includes status details in StatusConflictError', () => {
    try {
      validateTransition(
        PRN_STATUS.ACCEPTED,
        PRN_STATUS.DRAFT,
        PRN_ACTOR.PRODUCER
      )
    } catch (error) {
      expect(error.currentStatus).toBe(PRN_STATUS.ACCEPTED)
      expect(error.newStatus).toBe(PRN_STATUS.DRAFT)
    }
  })

  it('includes actor details in UnauthorisedTransitionError', () => {
    try {
      validateTransition(
        PRN_STATUS.AWAITING_ACCEPTANCE,
        PRN_STATUS.ACCEPTED,
        PRN_ACTOR.SIGNATORY
      )
    } catch (error) {
      expect(error.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
      expect(error.newStatus).toBe(PRN_STATUS.ACCEPTED)
      expect(error.actor).toBe(PRN_ACTOR.SIGNATORY)
    }
  })
})

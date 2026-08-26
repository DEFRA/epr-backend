import { describe, it, expect } from 'vitest'

import {
  PRN_STATUS,
  PRN_STATUS_TRANSITIONS,
  PRN_ACTOR,
  isValidTransition,
  validateTransition,
  assertAccreditationCanIssue,
  AccreditationStatusError,
  StatusConflictError,
  UnauthorisedTransitionError
} from './model.js'

/** @import {AccreditationStatus} from '#domain/organisations/model.js' */
/** @import {PrnStatus} from './model.js' */

describe('PRN_STATUS_TRANSITIONS', () => {
  it('has empty array for terminal states', () => {
    expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.CANCELLED]).toEqual([])
    expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.DELETED]).toEqual([])
    expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.DISCARDED]).toEqual([])
  })

  it('allows only accepted -> cancelled for a service maintainer (PAE-1823)', () => {
    expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.ACCEPTED]).toEqual([
      { status: PRN_STATUS.CANCELLED, actors: [PRN_ACTOR.SERVICE_MAINTAINER] }
    ])
  })

  it('allows a service maintainer to cancel from awaiting_acceptance, alongside the existing producer transitions (PAE-1859)', () => {
    expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.AWAITING_ACCEPTANCE]).toEqual([
      { status: PRN_STATUS.ACCEPTED, actors: [PRN_ACTOR.PRODUCER] },
      {
        status: PRN_STATUS.AWAITING_CANCELLATION,
        actors: [PRN_ACTOR.PRODUCER]
      },
      { status: PRN_STATUS.CANCELLED, actors: [PRN_ACTOR.SERVICE_MAINTAINER] }
    ])
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
    ],
    [PRN_STATUS.ACCEPTED, PRN_STATUS.CANCELLED, PRN_ACTOR.SERVICE_MAINTAINER],
    [
      PRN_STATUS.AWAITING_ACCEPTANCE,
      PRN_STATUS.CANCELLED,
      PRN_ACTOR.SERVICE_MAINTAINER
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
    [PRN_STATUS.ACCEPTED, PRN_STATUS.DELETED, PRN_ACTOR.SERVICE_MAINTAINER],
    [PRN_STATUS.ACCEPTED, PRN_STATUS.CANCELLED, PRN_ACTOR.SIGNATORY],
    [PRN_STATUS.ACCEPTED, PRN_STATUS.CANCELLED, PRN_ACTOR.PRODUCER],
    [PRN_STATUS.ACCEPTED, PRN_STATUS.CANCELLED, PRN_ACTOR.REPROCESSOR_EXPORTER],
    [PRN_STATUS.AWAITING_ACCEPTANCE, PRN_STATUS.CANCELLED, PRN_ACTOR.PRODUCER],
    [PRN_STATUS.AWAITING_ACCEPTANCE, PRN_STATUS.CANCELLED, PRN_ACTOR.SIGNATORY],
    [
      PRN_STATUS.AWAITING_ACCEPTANCE,
      PRN_STATUS.CANCELLED,
      PRN_ACTOR.REPROCESSOR_EXPORTER
    ],
    [/** @type {PrnStatus} */ ('unknown'), PRN_STATUS.DRAFT, PRN_ACTOR.PRODUCER]
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
    let thrownError
    try {
      validateTransition(
        PRN_STATUS.ACCEPTED,
        PRN_STATUS.DRAFT,
        PRN_ACTOR.PRODUCER
      )
    } catch (e) {
      thrownError = e
    }

    expect(thrownError?.currentStatus).toBe(PRN_STATUS.ACCEPTED)
    expect(thrownError?.newStatus).toBe(PRN_STATUS.DRAFT)
  })

  it('includes actor details in UnauthorisedTransitionError', () => {
    let thrownError
    try {
      validateTransition(
        PRN_STATUS.AWAITING_ACCEPTANCE,
        PRN_STATUS.ACCEPTED,
        PRN_ACTOR.SIGNATORY
      )
    } catch (e) {
      thrownError = e
    }

    expect(thrownError?.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
    expect(thrownError?.newStatus).toBe(PRN_STATUS.ACCEPTED)
    expect(thrownError?.actor).toBe(PRN_ACTOR.SIGNATORY)
  })
})

describe('assertAccreditationCanIssue', () => {
  /** @type {AccreditationStatus[]} */
  const issuableStatuses = ['approved', 'created', 'rejected']

  /** @type {AccreditationStatus[]} */
  const blockedStatuses = ['suspended', 'cancelled']

  it.each(issuableStatuses)(
    'does not throw when accreditation is %s',
    (status) => {
      expect(() => assertAccreditationCanIssue({ status })).not.toThrow()
    }
  )

  it.each(blockedStatuses)(
    'throws AccreditationStatusError when accreditation is %s',
    (status) => {
      expect(() => assertAccreditationCanIssue({ status })).toThrow(
        AccreditationStatusError
      )
    }
  )

  it('does not throw when accreditation is missing', () => {
    expect(() => assertAccreditationCanIssue(null)).not.toThrow()
  })

  it('describes the action and status in the error message', () => {
    expect(() => assertAccreditationCanIssue({ status: 'suspended' })).toThrow(
      'Cannot issue a PRN on a suspended accreditation'
    )
  })
})

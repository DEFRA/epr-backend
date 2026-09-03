import { describe, it, expect } from 'vitest'

import {
  PRN_STATUS,
  PRN_STATUS_TRANSITIONS,
  PRN_ACTOR,
  isValidTransition,
  transitionRefusal,
  issuanceRefusal,
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

describe('transitionRefusal', () => {
  it('is undefined for valid transitions', () => {
    expect(
      transitionRefusal(
        PRN_STATUS.AWAITING_ACCEPTANCE,
        PRN_STATUS.ACCEPTED,
        PRN_ACTOR.PRODUCER
      )
    ).toBeUndefined()
  })

  it('is a StatusConflictError when no transition exists from current to new status', () => {
    expect(
      transitionRefusal(
        PRN_STATUS.ACCEPTED,
        PRN_STATUS.DRAFT,
        PRN_ACTOR.PRODUCER
      )
    ).toBeInstanceOf(StatusConflictError)
  })

  it('is a StatusConflictError for terminal states', () => {
    expect(
      transitionRefusal(
        PRN_STATUS.CANCELLED,
        PRN_STATUS.ACCEPTED,
        PRN_ACTOR.PRODUCER
      )
    ).toBeInstanceOf(StatusConflictError)
  })

  it('is an UnauthorisedTransitionError when transition exists but actor is not permitted', () => {
    expect(
      transitionRefusal(
        PRN_STATUS.AWAITING_ACCEPTANCE,
        PRN_STATUS.ACCEPTED,
        PRN_ACTOR.SIGNATORY
      )
    ).toBeInstanceOf(UnauthorisedTransitionError)
  })

  it('includes status details in StatusConflictError', () => {
    const refusal = transitionRefusal(
      PRN_STATUS.ACCEPTED,
      PRN_STATUS.DRAFT,
      PRN_ACTOR.PRODUCER
    )

    expect(refusal).toBeInstanceOf(StatusConflictError)
    expect(refusal).toMatchObject({
      currentStatus: PRN_STATUS.ACCEPTED,
      newStatus: PRN_STATUS.DRAFT
    })
  })

  it('includes actor details in UnauthorisedTransitionError', () => {
    const refusal = transitionRefusal(
      PRN_STATUS.AWAITING_ACCEPTANCE,
      PRN_STATUS.ACCEPTED,
      PRN_ACTOR.SIGNATORY
    )

    expect(refusal).toBeInstanceOf(UnauthorisedTransitionError)
    expect(refusal).toMatchObject({
      currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      newStatus: PRN_STATUS.ACCEPTED,
      actor: PRN_ACTOR.SIGNATORY
    })
  })
})

describe('issuanceRefusal', () => {
  /** @type {AccreditationStatus[]} */
  const issuableStatuses = ['approved', 'created', 'rejected']

  /** @type {AccreditationStatus[]} */
  const blockedStatuses = ['suspended', 'cancelled']

  it.each(issuableStatuses)(
    'is undefined when accreditation is %s',
    (status) => {
      expect(
        issuanceRefusal(PRN_STATUS.AWAITING_ACCEPTANCE, { status })
      ).toBeUndefined()
    }
  )

  it.each(blockedStatuses)(
    'is an AccreditationStatusError when accreditation is %s',
    (status) => {
      expect(
        issuanceRefusal(PRN_STATUS.AWAITING_ACCEPTANCE, { status })
      ).toBeInstanceOf(AccreditationStatusError)
    }
  )

  it('is undefined when accreditation is missing', () => {
    expect(
      issuanceRefusal(PRN_STATUS.AWAITING_ACCEPTANCE, null)
    ).toBeUndefined()
  })

  it.each(blockedStatuses)(
    'has no view on a transition that is not issuance, even when accreditation is %s',
    (status) => {
      expect(issuanceRefusal(PRN_STATUS.ACCEPTED, { status })).toBeUndefined()
    }
  )

  it('describes the action and status in the refusal message', () => {
    expect(
      issuanceRefusal(PRN_STATUS.AWAITING_ACCEPTANCE, { status: 'suspended' })
        ?.message
    ).toBe('Cannot issue a PRN on a suspended accreditation')
  })
})

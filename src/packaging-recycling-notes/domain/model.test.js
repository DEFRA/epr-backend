import { describe, it, expect } from 'vitest'

import {
  PRN_STATUS,
  PRN_STATUS_TRANSITIONS,
  PRN_ACTOR,
  isValidTransition
} from './model.js'

describe('PRN_STATUS', () => {
  it('includes awaiting_cancellation status', () => {
    expect(PRN_STATUS.AWAITING_CANCELLATION).toBe('awaiting_cancellation')
  })

  it('does not include rejected as a status', () => {
    expect(PRN_STATUS).not.toHaveProperty('REJECTED')
  })
})

describe('PRN_ACTOR', () => {
  it('defines reprocessor_exporter actor', () => {
    expect(PRN_ACTOR.REPROCESSOR_EXPORTER).toBe('reprocessor_exporter')
  })

  it('defines signatory actor', () => {
    expect(PRN_ACTOR.SIGNATORY).toBe('signatory')
  })

  it('defines producer actor', () => {
    expect(PRN_ACTOR.PRODUCER).toBe('producer')
  })
})

describe('PRN_STATUS_TRANSITIONS', () => {
  it('does not have a transition entry for rejected', () => {
    expect(PRN_STATUS_TRANSITIONS).not.toHaveProperty('rejected')
  })

  describe('actor-aware structure', () => {
    it('stores transitions as objects with status and actors', () => {
      const draftTransitions = PRN_STATUS_TRANSITIONS[PRN_STATUS.DRAFT]
      expect(draftTransitions[0]).toHaveProperty('status')
      expect(draftTransitions[0]).toHaveProperty('actors')
      expect(Array.isArray(draftTransitions[0].actors)).toBe(true)
    })

    it('has empty array for terminal states', () => {
      expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.ACCEPTED]).toEqual([])
      expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.CANCELLED]).toEqual([])
      expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.DELETED]).toEqual([])
      expect(PRN_STATUS_TRANSITIONS[PRN_STATUS.DISCARDED]).toEqual([])
    })
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

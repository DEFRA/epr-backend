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

  describe('reprocessor/exporter transitions', () => {
    it('allows draft to awaiting_authorisation for reprocessor/exporter', () => {
      expect(
        isValidTransition(
          PRN_STATUS.DRAFT,
          PRN_STATUS.AWAITING_AUTHORISATION,
          PRN_ACTOR.REPROCESSOR_EXPORTER
        )
      ).toBe(true)
    })

    it('allows draft to discarded for reprocessor/exporter', () => {
      expect(
        isValidTransition(
          PRN_STATUS.DRAFT,
          PRN_STATUS.DISCARDED,
          PRN_ACTOR.REPROCESSOR_EXPORTER
        )
      ).toBe(true)
    })

    it('blocks signatory from draft transitions', () => {
      expect(
        isValidTransition(
          PRN_STATUS.DRAFT,
          PRN_STATUS.AWAITING_AUTHORISATION,
          PRN_ACTOR.SIGNATORY
        )
      ).toBe(false)
    })
  })

  describe('signatory transitions', () => {
    it('allows awaiting_authorisation to awaiting_acceptance for signatory', () => {
      expect(
        isValidTransition(
          PRN_STATUS.AWAITING_AUTHORISATION,
          PRN_STATUS.AWAITING_ACCEPTANCE,
          PRN_ACTOR.SIGNATORY
        )
      ).toBe(true)
    })

    it('allows awaiting_authorisation to deleted for signatory', () => {
      expect(
        isValidTransition(
          PRN_STATUS.AWAITING_AUTHORISATION,
          PRN_STATUS.DELETED,
          PRN_ACTOR.SIGNATORY
        )
      ).toBe(true)
    })

    it('allows awaiting_cancellation to cancelled for signatory', () => {
      expect(
        isValidTransition(
          PRN_STATUS.AWAITING_CANCELLATION,
          PRN_STATUS.CANCELLED,
          PRN_ACTOR.SIGNATORY
        )
      ).toBe(true)
    })

    it('blocks reprocessor/exporter from signatory transitions', () => {
      expect(
        isValidTransition(
          PRN_STATUS.AWAITING_AUTHORISATION,
          PRN_STATUS.AWAITING_ACCEPTANCE,
          PRN_ACTOR.REPROCESSOR_EXPORTER
        )
      ).toBe(false)
    })
  })

  describe('producer transitions', () => {
    it('allows awaiting_acceptance to accepted for producer', () => {
      expect(
        isValidTransition(
          PRN_STATUS.AWAITING_ACCEPTANCE,
          PRN_STATUS.ACCEPTED,
          PRN_ACTOR.PRODUCER
        )
      ).toBe(true)
    })

    it('allows awaiting_acceptance to awaiting_cancellation for producer', () => {
      expect(
        isValidTransition(
          PRN_STATUS.AWAITING_ACCEPTANCE,
          PRN_STATUS.AWAITING_CANCELLATION,
          PRN_ACTOR.PRODUCER
        )
      ).toBe(true)
    })

    it('blocks signatory from producer transitions', () => {
      expect(
        isValidTransition(
          PRN_STATUS.AWAITING_ACCEPTANCE,
          PRN_STATUS.ACCEPTED,
          PRN_ACTOR.SIGNATORY
        )
      ).toBe(false)
    })

    it('blocks reprocessor/exporter from producer transitions', () => {
      expect(
        isValidTransition(
          PRN_STATUS.AWAITING_ACCEPTANCE,
          PRN_STATUS.ACCEPTED,
          PRN_ACTOR.REPROCESSOR_EXPORTER
        )
      ).toBe(false)
    })
  })

  describe('invalid transitions', () => {
    it('rejects transitions not in the map regardless of actor', () => {
      expect(
        isValidTransition(
          PRN_STATUS.DRAFT,
          PRN_STATUS.ACCEPTED,
          PRN_ACTOR.PRODUCER
        )
      ).toBe(false)
    })

    it('rejects transitions from terminal states', () => {
      expect(
        isValidTransition(
          PRN_STATUS.ACCEPTED,
          PRN_STATUS.DRAFT,
          PRN_ACTOR.PRODUCER
        )
      ).toBe(false)
    })

    it('rejects transitions for unknown current status', () => {
      expect(
        isValidTransition('unknown', PRN_STATUS.DRAFT, PRN_ACTOR.PRODUCER)
      ).toBe(false)
    })
  })
})

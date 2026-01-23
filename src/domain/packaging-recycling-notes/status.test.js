import { describe, expect, it } from 'vitest'

import {
  getDefaultStatus,
  PRN_STATUS,
  validateStatusTransition
} from './status.js'

describe('PRN status', () => {
  describe('PRN_STATUS', () => {
    it('contains all expected status values', () => {
      expect(PRN_STATUS).toEqual({
        DRAFT: 'draft',
        AWAITING_AUTHORISATION: 'awaiting_authorisation',
        AWAITING_ACCEPTANCE: 'awaiting_acceptance',
        ACCEPTED: 'accepted',
        REJECTED: 'rejected',
        AWAITING_CANCELLATION: 'awaiting_cancellation',
        CANCELLED: 'cancelled',
        DELETED: 'deleted'
      })
    })

    it('is frozen and cannot be modified', () => {
      expect(Object.isFrozen(PRN_STATUS)).toBe(true)
    })
  })

  describe('getDefaultStatus', () => {
    it('returns draft status', () => {
      const result = getDefaultStatus()
      expect(result).toBe(PRN_STATUS.DRAFT)
    })
  })

  describe('validateStatusTransition', () => {
    describe('initial status (no current status)', () => {
      it('allows transition to draft when currentStatus is undefined', () => {
        const result = validateStatusTransition(undefined, PRN_STATUS.DRAFT)
        expect(result).toBe(true)
      })

      it('allows transition to draft when currentStatus is null', () => {
        const result = validateStatusTransition(null, PRN_STATUS.DRAFT)
        expect(result).toBe(true)
      })

      it('throws error when initial status is not draft', () => {
        expect(() =>
          validateStatusTransition(undefined, PRN_STATUS.AWAITING_AUTHORISATION)
        ).toThrow(
          'Cannot transition PRN from undefined to awaiting_authorisation'
        )
      })
    })

    describe('transitions from draft', () => {
      it('allows transition to awaiting_authorisation', () => {
        const result = validateStatusTransition(
          PRN_STATUS.DRAFT,
          PRN_STATUS.AWAITING_AUTHORISATION
        )
        expect(result).toBe(true)
      })

      it('allows transition to deleted', () => {
        const result = validateStatusTransition(
          PRN_STATUS.DRAFT,
          PRN_STATUS.DELETED
        )
        expect(result).toBe(true)
      })

      it('throws error for invalid transition to accepted', () => {
        expect(() =>
          validateStatusTransition(PRN_STATUS.DRAFT, PRN_STATUS.ACCEPTED)
        ).toThrow('Cannot transition PRN from draft to accepted')
      })

      it('throws error for invalid transition to awaiting_acceptance', () => {
        expect(() =>
          validateStatusTransition(
            PRN_STATUS.DRAFT,
            PRN_STATUS.AWAITING_ACCEPTANCE
          )
        ).toThrow('Cannot transition PRN from draft to awaiting_acceptance')
      })
    })

    describe('transitions from awaiting_authorisation', () => {
      it('allows transition to awaiting_acceptance', () => {
        const result = validateStatusTransition(
          PRN_STATUS.AWAITING_AUTHORISATION,
          PRN_STATUS.AWAITING_ACCEPTANCE
        )
        expect(result).toBe(true)
      })

      it('allows transition to deleted', () => {
        const result = validateStatusTransition(
          PRN_STATUS.AWAITING_AUTHORISATION,
          PRN_STATUS.DELETED
        )
        expect(result).toBe(true)
      })

      it('throws error for invalid transition to draft', () => {
        expect(() =>
          validateStatusTransition(
            PRN_STATUS.AWAITING_AUTHORISATION,
            PRN_STATUS.DRAFT
          )
        ).toThrow('Cannot transition PRN from awaiting_authorisation to draft')
      })

      it('throws error for invalid transition to accepted', () => {
        expect(() =>
          validateStatusTransition(
            PRN_STATUS.AWAITING_AUTHORISATION,
            PRN_STATUS.ACCEPTED
          )
        ).toThrow(
          'Cannot transition PRN from awaiting_authorisation to accepted'
        )
      })
    })

    describe('transitions from awaiting_acceptance', () => {
      it('allows transition to accepted', () => {
        const result = validateStatusTransition(
          PRN_STATUS.AWAITING_ACCEPTANCE,
          PRN_STATUS.ACCEPTED
        )
        expect(result).toBe(true)
      })

      it('allows transition to rejected', () => {
        const result = validateStatusTransition(
          PRN_STATUS.AWAITING_ACCEPTANCE,
          PRN_STATUS.REJECTED
        )
        expect(result).toBe(true)
      })

      it('allows transition to awaiting_cancellation', () => {
        const result = validateStatusTransition(
          PRN_STATUS.AWAITING_ACCEPTANCE,
          PRN_STATUS.AWAITING_CANCELLATION
        )
        expect(result).toBe(true)
      })

      it('throws error for invalid transition to draft', () => {
        expect(() =>
          validateStatusTransition(
            PRN_STATUS.AWAITING_ACCEPTANCE,
            PRN_STATUS.DRAFT
          )
        ).toThrow('Cannot transition PRN from awaiting_acceptance to draft')
      })

      it('throws error for invalid transition to deleted', () => {
        expect(() =>
          validateStatusTransition(
            PRN_STATUS.AWAITING_ACCEPTANCE,
            PRN_STATUS.DELETED
          )
        ).toThrow('Cannot transition PRN from awaiting_acceptance to deleted')
      })
    })

    describe('transitions from accepted', () => {
      it('allows transition to awaiting_cancellation', () => {
        const result = validateStatusTransition(
          PRN_STATUS.ACCEPTED,
          PRN_STATUS.AWAITING_CANCELLATION
        )
        expect(result).toBe(true)
      })

      it('throws error for invalid transition to draft', () => {
        expect(() =>
          validateStatusTransition(PRN_STATUS.ACCEPTED, PRN_STATUS.DRAFT)
        ).toThrow('Cannot transition PRN from accepted to draft')
      })

      it('throws error for invalid transition to rejected', () => {
        expect(() =>
          validateStatusTransition(PRN_STATUS.ACCEPTED, PRN_STATUS.REJECTED)
        ).toThrow('Cannot transition PRN from accepted to rejected')
      })
    })

    describe('transitions from rejected (terminal state)', () => {
      it.each([
        PRN_STATUS.DRAFT,
        PRN_STATUS.AWAITING_AUTHORISATION,
        PRN_STATUS.AWAITING_ACCEPTANCE,
        PRN_STATUS.ACCEPTED,
        PRN_STATUS.AWAITING_CANCELLATION,
        PRN_STATUS.CANCELLED,
        PRN_STATUS.DELETED
      ])('throws error for transition to %s', (toStatus) => {
        expect(() =>
          validateStatusTransition(PRN_STATUS.REJECTED, toStatus)
        ).toThrow(`Cannot transition PRN from rejected to ${toStatus}`)
      })
    })

    describe('transitions from awaiting_cancellation', () => {
      it('allows transition to cancelled', () => {
        const result = validateStatusTransition(
          PRN_STATUS.AWAITING_CANCELLATION,
          PRN_STATUS.CANCELLED
        )
        expect(result).toBe(true)
      })

      it('throws error for invalid transition to accepted', () => {
        expect(() =>
          validateStatusTransition(
            PRN_STATUS.AWAITING_CANCELLATION,
            PRN_STATUS.ACCEPTED
          )
        ).toThrow(
          'Cannot transition PRN from awaiting_cancellation to accepted'
        )
      })
    })

    describe('transitions from cancelled (terminal state)', () => {
      it.each([
        PRN_STATUS.DRAFT,
        PRN_STATUS.AWAITING_AUTHORISATION,
        PRN_STATUS.AWAITING_ACCEPTANCE,
        PRN_STATUS.ACCEPTED,
        PRN_STATUS.REJECTED,
        PRN_STATUS.AWAITING_CANCELLATION,
        PRN_STATUS.DELETED
      ])('throws error for transition to %s', (toStatus) => {
        expect(() =>
          validateStatusTransition(PRN_STATUS.CANCELLED, toStatus)
        ).toThrow(`Cannot transition PRN from cancelled to ${toStatus}`)
      })
    })

    describe('transitions from deleted (terminal state)', () => {
      it.each([
        PRN_STATUS.DRAFT,
        PRN_STATUS.AWAITING_AUTHORISATION,
        PRN_STATUS.AWAITING_ACCEPTANCE,
        PRN_STATUS.ACCEPTED,
        PRN_STATUS.REJECTED,
        PRN_STATUS.AWAITING_CANCELLATION,
        PRN_STATUS.CANCELLED
      ])('throws error for transition to %s', (toStatus) => {
        expect(() =>
          validateStatusTransition(PRN_STATUS.DELETED, toStatus)
        ).toThrow(`Cannot transition PRN from deleted to ${toStatus}`)
      })
    })

    describe('error properties', () => {
      it('includes fromStatus and toStatus on error', () => {
        try {
          validateStatusTransition(PRN_STATUS.DRAFT, PRN_STATUS.ACCEPTED)
          expect.fail('Should have thrown')
        } catch (error) {
          expect(error.name).toBe('InvalidStatusTransitionError')
          expect(error.fromStatus).toBe(PRN_STATUS.DRAFT)
          expect(error.toStatus).toBe(PRN_STATUS.ACCEPTED)
        }
      })
    })

    describe('unknown status', () => {
      it('throws error for unknown current status', () => {
        expect(() =>
          validateStatusTransition('unknown_status', PRN_STATUS.DRAFT)
        ).toThrow('Cannot transition PRN from unknown_status to draft')
      })
    })
  })
})

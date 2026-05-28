import { describe, it, expect } from 'vitest'

import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { foldPrnFromTailEvents } from './fold-prn-from-tail-events.js'

const basePrn = () => ({
  id: 'prn-1',
  registrationId: 'reg-1',
  accreditation: { id: 'acc-1' },
  status: {
    currentStatus: PRN_STATUS.DRAFT,
    currentStatusAt: new Date('2026-01-15T10:00:00.000Z')
  }
})

const buildEvent = (kind, number, createdAt) => ({
  id: `event-${number}`,
  registrationId: 'reg-1',
  accreditationId: 'acc-1',
  organisationId: 'org-1',
  number,
  kind,
  payload: { prnId: 'prn-1', amount: 50 },
  openingBalance: { amount: 100, availableAmount: 100 },
  closingBalance: { amount: 100, availableAmount: 50 },
  createdAt: new Date(createdAt),
  createdBy: { id: 'user-1', name: 'Test User' }
})

describe('foldPrnFromTailEvents', () => {
  describe('with no tail events', () => {
    it('returns the PRN unchanged', () => {
      const prn = basePrn()

      const result = foldPrnFromTailEvents(prn, [])

      expect(result).toBe(prn)
    })
  })

  describe('fold map', () => {
    it('prn-created folds to awaiting_authorisation', () => {
      const prn = basePrn()
      const event = buildEvent(
        STREAM_EVENT_KIND.PRN_CREATED,
        1,
        '2026-02-01T12:00:00.000Z'
      )

      const result = foldPrnFromTailEvents(prn, [event])

      expect(result.status.currentStatus).toBe(
        PRN_STATUS.AWAITING_AUTHORISATION
      )
      expect(result.status.currentStatusAt).toEqual(event.createdAt)
      expect(result.lastAppliedEventNumber).toBe(1)
    })

    it('prn-issued folds to awaiting_acceptance', () => {
      const prn = { ...basePrn(), lastAppliedEventNumber: 1 }
      const event = buildEvent(
        STREAM_EVENT_KIND.PRN_ISSUED,
        2,
        '2026-02-02T12:00:00.000Z'
      )

      const result = foldPrnFromTailEvents(prn, [event])

      expect(result.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
      expect(result.status.currentStatusAt).toEqual(event.createdAt)
      expect(result.lastAppliedEventNumber).toBe(2)
    })

    it('prn-creation-cancelled folds to deleted', () => {
      const prn = basePrn()
      const event = buildEvent(
        STREAM_EVENT_KIND.PRN_CREATION_CANCELLED,
        3,
        '2026-02-03T12:00:00.000Z'
      )

      const result = foldPrnFromTailEvents(prn, [event])

      expect(result.status.currentStatus).toBe(PRN_STATUS.DELETED)
      expect(result.status.currentStatusAt).toEqual(event.createdAt)
      expect(result.lastAppliedEventNumber).toBe(3)
    })

    it('prn-cancelled-after-issue folds to cancelled', () => {
      const prn = basePrn()
      const event = buildEvent(
        STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
        4,
        '2026-02-04T12:00:00.000Z'
      )

      const result = foldPrnFromTailEvents(prn, [event])

      expect(result.status.currentStatus).toBe(PRN_STATUS.CANCELLED)
      expect(result.status.currentStatusAt).toEqual(event.createdAt)
      expect(result.lastAppliedEventNumber).toBe(4)
    })

    it('throws on an unmappable kind (e.g. summary-log-submitted)', () => {
      const prn = basePrn()
      const event = buildEvent(
        STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
        1,
        '2026-02-01T12:00:00.000Z'
      )

      expect(() => foldPrnFromTailEvents(prn, [event])).toThrow(
        /unmappable stream event kind/i
      )
    })
  })

  describe('with multiple tail events', () => {
    it('folds from the latest (highest-numbered) event', () => {
      const prn = basePrn()
      const earlier = buildEvent(
        STREAM_EVENT_KIND.PRN_CREATED,
        1,
        '2026-02-01T12:00:00.000Z'
      )
      const latest = buildEvent(
        STREAM_EVENT_KIND.PRN_ISSUED,
        2,
        '2026-02-02T12:00:00.000Z'
      )

      const result = foldPrnFromTailEvents(prn, [earlier, latest])

      expect(result.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
      expect(result.status.currentStatusAt).toEqual(latest.createdAt)
      expect(result.lastAppliedEventNumber).toBe(2)
    })
  })

  describe('preserves the rest of the PRN', () => {
    it('does not mutate the input', () => {
      const prn = basePrn()
      const snapshot = structuredClone(prn)
      const event = buildEvent(
        STREAM_EVENT_KIND.PRN_ISSUED,
        2,
        '2026-02-02T12:00:00.000Z'
      )

      foldPrnFromTailEvents(prn, [event])

      expect(prn).toEqual(snapshot)
    })

    it('keeps other top-level fields and nested status fields', () => {
      const prn = {
        ...basePrn(),
        tonnage: 50,
        prnNumber: 'ER1234567890A',
        status: {
          ...basePrn().status,
          history: [{ status: PRN_STATUS.DRAFT, at: new Date(), by: {} }],
          issued: { at: new Date('2026-01-16T14:30:00.000Z'), by: { id: 'u' } }
        }
      }
      const event = buildEvent(
        STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
        5,
        '2026-02-05T12:00:00.000Z'
      )

      const result = foldPrnFromTailEvents(prn, [event])

      expect(result.tonnage).toBe(50)
      expect(result.prnNumber).toBe('ER1234567890A')
      expect(result.status.history).toEqual(prn.status.history)
      expect(result.status.issued).toEqual(prn.status.issued)
      expect(result.status.currentStatus).toBe(PRN_STATUS.CANCELLED)
    })
  })
})

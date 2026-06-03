import { describe, it, expect } from 'vitest'

import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { foldPrnFromTailEvents } from './fold-prn-from-tail-events.js'

/**
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 */

const baseUpdatedAt = new Date('2026-01-15T10:00:00.000Z')
const baseCreator = { id: 'creator', name: 'Original Creator' }

/** @returns {PackagingRecyclingNote} */
const basePrn = () =>
  /** @type {PackagingRecyclingNote} */ (
    /** @type {unknown} */ ({
      id: 'prn-1',
      registrationId: 'reg-1',
      accreditation: { id: 'acc-1' },
      version: 1,
      updatedAt: baseUpdatedAt,
      updatedBy: baseCreator,
      status: {
        currentStatus: PRN_STATUS.DRAFT,
        currentStatusAt: baseUpdatedAt,
        history: [
          { status: PRN_STATUS.DRAFT, at: baseUpdatedAt, by: baseCreator }
        ]
      }
    })
  )

const eventCreator = { id: 'user-1', name: 'Test User' }

const buildEvent = (kind, number, createdAt, createdBy = eventCreator) => ({
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
  createdBy
})

describe('foldPrnFromTailEvents', () => {
  describe('with no tail events', () => {
    it('returns the PRN unchanged', () => {
      const prn = basePrn()

      const result = foldPrnFromTailEvents(prn, [])

      expect(result).toBe(prn)
    })
  })

  describe('per-event projection', () => {
    it('prn-created sets status, slot, history, version, updatedAt/By and watermark', () => {
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
      expect(result.status.created).toEqual({
        at: event.createdAt,
        by: event.createdBy
      })
      expect(result.status.history).toEqual([
        ...prn.status.history,
        {
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          at: event.createdAt,
          by: event.createdBy
        }
      ])
      expect(result.version).toBe(2)
      expect(result.updatedAt).toEqual(event.createdAt)
      expect(result.updatedBy).toEqual(event.createdBy)
      expect(result.lastAppliedEventNumber).toBe(1)
    })

    it('narrows the event actor to id and name, dropping the stream-only email', () => {
      const prn = basePrn()
      const event = buildEvent(
        STREAM_EVENT_KIND.PRN_CREATED,
        1,
        '2026-02-01T12:00:00.000Z',
        { id: 'user-1', name: 'Test User', email: 'test@example.com' }
      )

      const result = foldPrnFromTailEvents(prn, [event])

      const expectedActor = { id: 'user-1', name: 'Test User' }
      expect(result.updatedBy).toEqual(expectedActor)
      expect(result.status.created.by).toEqual(expectedActor)
      expect(result.status.history.at(-1).by).toEqual(expectedActor)
    })

    it('prn-issued sets currentStatus awaiting_acceptance and issued slot', () => {
      const prn = basePrn()
      const event = buildEvent(
        STREAM_EVENT_KIND.PRN_ISSUED,
        2,
        '2026-02-02T12:00:00.000Z'
      )

      const result = foldPrnFromTailEvents(prn, [event])

      expect(result.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
      expect(result.status.issued).toEqual({
        at: event.createdAt,
        by: event.createdBy
      })
      expect(result.status.history.at(-1)).toEqual({
        status: PRN_STATUS.AWAITING_ACCEPTANCE,
        at: event.createdAt,
        by: event.createdBy
      })
    })

    it('prn-accepted sets currentStatus accepted and accepted slot', () => {
      const prn = basePrn()
      const event = buildEvent(
        STREAM_EVENT_KIND.PRN_ACCEPTED,
        3,
        '2026-02-03T12:00:00.000Z'
      )

      const result = foldPrnFromTailEvents(prn, [event])

      expect(result.status.currentStatus).toBe(PRN_STATUS.ACCEPTED)
      expect(result.status.accepted).toEqual({
        at: event.createdAt,
        by: event.createdBy
      })
      expect(result.status.history.at(-1)).toEqual({
        status: PRN_STATUS.ACCEPTED,
        at: event.createdAt,
        by: event.createdBy
      })
    })

    it('prn-rejected sets currentStatus awaiting_cancellation and rejected slot', () => {
      const prn = basePrn()
      const event = buildEvent(
        STREAM_EVENT_KIND.PRN_REJECTED,
        4,
        '2026-02-04T12:00:00.000Z'
      )

      const result = foldPrnFromTailEvents(prn, [event])

      expect(result.status.currentStatus).toBe(PRN_STATUS.AWAITING_CANCELLATION)
      expect(result.status.rejected).toEqual({
        at: event.createdAt,
        by: event.createdBy
      })
      expect(result.status.history.at(-1)).toEqual({
        status: PRN_STATUS.AWAITING_CANCELLATION,
        at: event.createdAt,
        by: event.createdBy
      })
    })

    it('prn-creation-cancelled sets currentStatus deleted and deleted slot', () => {
      const prn = basePrn()
      const event = buildEvent(
        STREAM_EVENT_KIND.PRN_CREATION_CANCELLED,
        5,
        '2026-02-05T12:00:00.000Z'
      )

      const result = foldPrnFromTailEvents(prn, [event])

      expect(result.status.currentStatus).toBe(PRN_STATUS.DELETED)
      expect(result.status.deleted).toEqual({
        at: event.createdAt,
        by: event.createdBy
      })
      expect(result.status.history.at(-1)).toEqual({
        status: PRN_STATUS.DELETED,
        at: event.createdAt,
        by: event.createdBy
      })
    })

    it('prn-cancelled-after-issue sets currentStatus cancelled and cancelled slot', () => {
      const prn = basePrn()
      const event = buildEvent(
        STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
        6,
        '2026-02-06T12:00:00.000Z'
      )

      const result = foldPrnFromTailEvents(prn, [event])

      expect(result.status.currentStatus).toBe(PRN_STATUS.CANCELLED)
      expect(result.status.cancelled).toEqual({
        at: event.createdAt,
        by: event.createdBy
      })
      expect(result.status.history.at(-1)).toEqual({
        status: PRN_STATUS.CANCELLED,
        at: event.createdAt,
        by: event.createdBy
      })
    })
  })

  describe('multi-event left fold', () => {
    it('applies every event in order, populating each slot and appending each history entry', () => {
      const prn = basePrn()
      const created = buildEvent(
        STREAM_EVENT_KIND.PRN_CREATED,
        1,
        '2026-02-01T12:00:00.000Z'
      )
      const issued = buildEvent(
        STREAM_EVENT_KIND.PRN_ISSUED,
        2,
        '2026-02-02T12:00:00.000Z',
        { id: 'signatory', name: 'Sig Natory' }
      )

      const result = foldPrnFromTailEvents(prn, [created, issued])

      expect(result.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
      expect(result.status.currentStatusAt).toEqual(issued.createdAt)
      expect(result.status.created).toEqual({
        at: created.createdAt,
        by: created.createdBy
      })
      expect(result.status.issued).toEqual({
        at: issued.createdAt,
        by: issued.createdBy
      })
      expect(result.status.history.slice(-2)).toEqual([
        {
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          at: created.createdAt,
          by: created.createdBy
        },
        {
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          at: issued.createdAt,
          by: issued.createdBy
        }
      ])
      expect(result.version).toBe(3)
      expect(result.updatedAt).toEqual(issued.createdAt)
      expect(result.updatedBy).toEqual(issued.createdBy)
      expect(result.lastAppliedEventNumber).toBe(2)
    })
  })

  describe('error handling', () => {
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

  describe('purity', () => {
    it('does not mutate the input PRN', () => {
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

    it('keeps other top-level fields untouched', () => {
      const prn = {
        ...basePrn(),
        tonnage: 50,
        prnNumber: 'ER1234567890A',
        notes: 'leave me alone'
      }
      const event = buildEvent(
        STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
        5,
        '2026-02-05T12:00:00.000Z'
      )

      const result = foldPrnFromTailEvents(prn, [event])

      expect(result.tonnage).toBe(50)
      expect(result.prnNumber).toBe('ER1234567890A')
      expect(result.notes).toBe('leave me alone')
    })
  })
})

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'

/**
 * Stream-event-kind → PRN currentStatus the event projects to.
 *
 * @type {Record<string, import('#packaging-recycling-notes/domain/model.js').PrnStatus>}
 */
const STREAM_EVENT_KIND_TO_PRN_STATUS = Object.freeze({
  [STREAM_EVENT_KIND.PRN_CREATED]: PRN_STATUS.AWAITING_AUTHORISATION,
  [STREAM_EVENT_KIND.PRN_ISSUED]: PRN_STATUS.AWAITING_ACCEPTANCE,
  [STREAM_EVENT_KIND.PRN_ACCEPTED]: PRN_STATUS.ACCEPTED,
  [STREAM_EVENT_KIND.PRN_REJECTED]: PRN_STATUS.AWAITING_CANCELLATION,
  [STREAM_EVENT_KIND.PRN_CREATION_CANCELLED]: PRN_STATUS.DELETED,
  [STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE]: PRN_STATUS.CANCELLED
})

/**
 * Stream-event-kind → PRN status slot the event timestamps. Slot names follow
 * the business operation that occurred (rejected/deleted/cancelled), not the
 * resulting status — `prn-rejected` records on `status.rejected` even though
 * the currentStatus moves to `awaiting_cancellation`.
 *
 * @type {Record<string, 'created' | 'issued' | 'accepted' | 'rejected' | 'deleted' | 'cancelled'>}
 */
const STREAM_EVENT_KIND_TO_STATUS_SLOT = Object.freeze({
  [STREAM_EVENT_KIND.PRN_CREATED]: 'created',
  [STREAM_EVENT_KIND.PRN_ISSUED]: 'issued',
  [STREAM_EVENT_KIND.PRN_ACCEPTED]: 'accepted',
  [STREAM_EVENT_KIND.PRN_REJECTED]: 'rejected',
  [STREAM_EVENT_KIND.PRN_CREATION_CANCELLED]: 'deleted',
  [STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE]: 'cancelled'
})

/**
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} prn
 * @param {import('#waste-balances/repository/stream-schema.js').StreamEvent} event
 */
const applyEvent = (prn, event) => {
  const newStatus = STREAM_EVENT_KIND_TO_PRN_STATUS[event.kind]
  if (!newStatus) {
    throw new Error(`Unmappable stream event kind: ${event.kind}`)
  }
  const slot = STREAM_EVENT_KIND_TO_STATUS_SLOT[event.kind]
  const slotValue = { at: event.createdAt, by: event.createdBy }

  return {
    ...prn,
    version: (prn.version ?? 0) + 1,
    updatedAt: event.createdAt,
    updatedBy: event.createdBy,
    lastAppliedEventNumber: event.number,
    status: {
      ...prn.status,
      currentStatus: newStatus,
      currentStatusAt: event.createdAt,
      [slot]: slotValue,
      history: [
        ...prn.status.history,
        { status: newStatus, at: event.createdAt, by: event.createdBy }
      ]
    }
  }
}

/**
 * Left-fold over persisted stream tail events: applies each event in turn,
 * stamping its slot, appending a history entry, advancing currentStatus,
 * updatedAt/By, version and the lastAppliedEventNumber watermark.
 *
 * Pure: returns a new PRN, does not mutate the input. Returns the input
 * reference unchanged when no events are supplied.
 *
 * Expects events ordered by `number` ascending — the order
 * `WasteBalanceStreamRepository.findEventsByPrnIdAfter` guarantees.
 *
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} prn
 * @param {import('#waste-balances/repository/stream-schema.js').StreamEvent[]} tailEvents
 * @returns {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote}
 */
export const foldPrnFromTailEvents = (prn, tailEvents) => {
  if (tailEvents.length === 0) {
    return prn
  }
  return tailEvents.reduce(applyEvent, prn)
}

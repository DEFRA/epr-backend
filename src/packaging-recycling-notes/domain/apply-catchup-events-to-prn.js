import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { LEDGER_EVENT_KIND_TO_PRN_STATUS } from './prn-transition.js'

/**
 * Ledger-event-kind → PRN status slot the event timestamps. Slot names follow
 * the business operation that occurred (rejected/deleted/cancelled), not the
 * resulting status — `prn-rejected` records on `status.rejected` even though
 * the currentStatus moves to `awaiting_cancellation`.
 *
 * @type {Record<string, 'created' | 'issued' | 'accepted' | 'rejected' | 'deleted' | 'cancelled'>}
 */
const LEDGER_EVENT_KIND_TO_STATUS_SLOT = Object.freeze({
  [LEDGER_EVENT_KIND.PRN_CREATED]: 'created',
  [LEDGER_EVENT_KIND.PRN_ISSUED]: 'issued',
  [LEDGER_EVENT_KIND.PRN_ACCEPTED]: 'accepted',
  [LEDGER_EVENT_KIND.PRN_REJECTED]: 'rejected',
  [LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED]: 'deleted',
  [LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE]: 'cancelled'
})

/**
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} prn
 * @param {import('#waste-balances/repository/ledger-schema.js').LedgerEvent} event
 */
const applyEvent = (prn, event) => {
  const newStatus = LEDGER_EVENT_KIND_TO_PRN_STATUS[event.kind]
  if (!newStatus) {
    throw new Error(`Unmappable ledger event kind: ${event.kind}`)
  }
  const slot = LEDGER_EVENT_KIND_TO_STATUS_SLOT[event.kind]
  // PRN actors record id and name only; the event's createdBy may also carry an
  // email (best-view enrichment on the stream), which the PRN document omits.
  const by = { id: event.createdBy.id, name: event.createdBy.name }
  const slotValue = { at: event.createdAt, by }
  const obligationYear =
    event.kind === LEDGER_EVENT_KIND.PRN_ACCEPTED &&
    'obligationYear' in event.payload &&
    event.payload.obligationYear !== undefined
      ? { obligationYear: event.payload.obligationYear }
      : {}

  return {
    ...prn,
    ...obligationYear,
    updatedAt: event.createdAt,
    updatedBy: by,
    lastAppliedEventNumber: event.number,
    status: {
      ...prn.status,
      currentStatus: newStatus,
      currentStatusAt: event.createdAt,
      [slot]: slotValue,
      history: [
        ...prn.status.history,
        { status: newStatus, at: event.createdAt, by }
      ]
    }
  }
}

/**
 * Left-fold over a PRN's catch-up events: applies each event in turn,
 * stamping its slot, appending a history entry, advancing currentStatus,
 * updatedAt/By and the lastAppliedEventNumber watermark. The persisted-document
 * version is owned by the repository's optimistic-concurrency guard, so the
 * fold leaves it untouched.
 *
 * Pure: returns a new PRN, does not mutate the input. Returns the input
 * reference unchanged when no events are supplied.
 *
 * Expects events ordered by `number` ascending — the order
 * `WasteBalanceLedgerRepository.findEventsByPrnIdAfter` guarantees.
 *
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} prn
 * @param {import('#waste-balances/repository/ledger-schema.js').LedgerEvent[]} catchupEvents
 * @returns {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote}
 */
export const applyCatchupEventsToPrn = (prn, catchupEvents) => {
  if (catchupEvents.length === 0) {
    return prn
  }
  return catchupEvents.reduce((acc, event) => applyEvent(acc, event), prn)
}

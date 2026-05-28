import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { STREAM_EVENT_KIND } from '#waste-balances/repository/stream-schema.js'

/**
 * Stream-event-kind → PRN currentStatus when projected from a balance-affecting
 * event onto the PRN document. Only the four balance-affecting kinds appear
 * here; lifecycle-only transitions (accept, discard, awaiting-cancellation) do
 * not produce stream events and are not part of read-side catch-up.
 *
 * `prn-creation-cancelled` folds to `deleted` because the only transition out
 * of `awaiting_authorisation` that produces a `prn-creation-cancelled` event is
 * the signatory deleting the PRN; the alternative target (`awaiting_acceptance`)
 * issues `prn-issued` instead.
 *
 * @type {Record<string, import('#packaging-recycling-notes/domain/model.js').PrnStatus>}
 */
const STREAM_EVENT_KIND_TO_PRN_STATUS = Object.freeze({
  [STREAM_EVENT_KIND.PRN_CREATED]: PRN_STATUS.AWAITING_AUTHORISATION,
  [STREAM_EVENT_KIND.PRN_ISSUED]: PRN_STATUS.AWAITING_ACCEPTANCE,
  [STREAM_EVENT_KIND.PRN_CREATION_CANCELLED]: PRN_STATUS.DELETED,
  [STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE]: PRN_STATUS.CANCELLED
})

/**
 * Pure projection of stream tail events onto a PRN document. Returns the PRN
 * with `status.currentStatus`, `status.currentStatusAt` and
 * `lastAppliedEventNumber` updated from the last (highest-numbered) event, or
 * the PRN unchanged when no events are supplied.
 *
 * Expects `tailEvents` ordered by `number` ascending — the order
 * `WasteBalanceStreamRepository.findEventsByPrnIdAfter` guarantees.
 *
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} prn
 * @param {import('#waste-balances/repository/stream-schema.js').StreamEvent[]} tailEvents
 * @returns {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote}
 */
export const foldPrnFromTailEvents = (prn, tailEvents) => {
  const latest = tailEvents.at(-1)
  if (!latest) {
    return prn
  }

  const newStatus = STREAM_EVENT_KIND_TO_PRN_STATUS[latest.kind]
  if (!newStatus) {
    throw new Error(`Unmappable stream event kind: ${latest.kind}`)
  }

  return {
    ...prn,
    status: {
      ...prn.status,
      currentStatus: newStatus,
      currentStatusAt: latest.createdAt
    },
    lastAppliedEventNumber: latest.number
  }
}

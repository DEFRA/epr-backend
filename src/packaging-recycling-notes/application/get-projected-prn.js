import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { foldPrnFromTailEvents } from './fold-prn-from-tail-events.js'

/**
 * @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository
 * @typedef {import('#waste-balances/repository/port.js').WasteBalancesRepository} WasteBalancesRepository
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 */

/**
 * Reads a PRN and brings it current by folding any stream tail events past its
 * watermark, so callers receive the fully-formed PRN without touching the event
 * stream themselves. A missing or soft-deleted document short-circuits with no
 * stream query: a deleted PRN is terminal and has no further events to project.
 *
 * @param {Object} params
 * @param {PackagingRecyclingNotesRepository} params.packagingRecyclingNotesRepository
 * @param {WasteBalancesRepository} params.wasteBalancesRepository
 * @param {string} params.prnId
 * @returns {Promise<PackagingRecyclingNote | null>}
 */
export const getProjectedPrnById = async ({
  packagingRecyclingNotesRepository,
  wasteBalancesRepository,
  prnId
}) => {
  const prn = await packagingRecyclingNotesRepository.findById(prnId)

  if (!prn || prn.status.currentStatus === PRN_STATUS.DELETED) {
    return prn
  }

  const tailEvents = await wasteBalancesRepository.getPrnCatchupEvents({
    registrationId: prn.registrationId,
    accreditationId: prn.accreditation.id,
    prnId: prn.id,
    afterEventNumber: prn.lastAppliedEventNumber ?? 0
  })

  return foldPrnFromTailEvents(prn, tailEvents)
}

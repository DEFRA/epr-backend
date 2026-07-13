import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { foldPrnFromTailEvents } from './fold-prn-from-tail-events.js'

/**
 * @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository
 * @typedef {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} WasteBalanceLedgerRepository
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 */

/**
 * Brings a fetched PRN current by folding any stream tail events past its
 * watermark, so callers receive the fully-formed PRN without touching the event
 * stream themselves. A missing or soft-deleted document short-circuits with no
 * stream query: a deleted PRN is terminal and has no further events to project.
 *
 * @param {PackagingRecyclingNote | null} prn
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 * @returns {Promise<PackagingRecyclingNote | null>}
 */
const projectFromStreamTail = async (prn, ledgerRepository) => {
  if (!prn || prn.status.currentStatus === PRN_STATUS.DELETED) {
    return prn
  }

  const tailEvents = await createWasteBalanceService(
    ledgerRepository
  ).prnCatchupEvents({
    organisationId: prn.organisation.id,
    registrationId: prn.registrationId,
    accreditationId: prn.accreditation.id,
    prnId: prn.id,
    afterEventNumber: prn.lastAppliedEventNumber ?? 0
  })

  return foldPrnFromTailEvents(prn, tailEvents)
}

/**
 * Reads a PRN by id and projects it from its stream tail.
 *
 * @param {Object} params
 * @param {PackagingRecyclingNotesRepository} params.packagingRecyclingNotesRepository
 * @param {WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {string} params.prnId
 * @returns {Promise<PackagingRecyclingNote | null>}
 */
export const getProjectedPrnById = async ({
  packagingRecyclingNotesRepository,
  ledgerRepository,
  prnId
}) => {
  const prn = await packagingRecyclingNotesRepository.findById(prnId)
  return projectFromStreamTail(prn, ledgerRepository)
}

/**
 * Reads a PRN by its public number and projects it from its stream tail. The
 * external accept/reject path decides the next transition from the returned
 * status, so folding here keeps that decision off a stale document.
 *
 * @param {Object} params
 * @param {PackagingRecyclingNotesRepository} params.packagingRecyclingNotesRepository
 * @param {WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {string} params.prnNumber
 * @returns {Promise<PackagingRecyclingNote | null>}
 */
export const getProjectedPrnByNumber = async ({
  packagingRecyclingNotesRepository,
  ledgerRepository,
  prnNumber
}) => {
  const prn = await packagingRecyclingNotesRepository.findByPrnNumber(prnNumber)
  return projectFromStreamTail(prn, ledgerRepository)
}

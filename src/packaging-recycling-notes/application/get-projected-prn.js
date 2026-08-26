import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { applyCatchupEventsToPrn } from '#packaging-recycling-notes/domain/apply-catchup-events-to-prn.js'

/**
 * @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository
 * @typedef {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} WasteBalanceLedgerRepository
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 * @typedef {ReturnType<typeof createWasteBalanceService>} WasteBalanceService
 */

/**
 * The catch-up events are those past the watermark the document carries. The
 * document is a projection that can lag the stream, so this is how a PRN's
 * state is read (ADR-0036, "Reading PRN state").
 *
 * @param {PackagingRecyclingNote} prn
 * @param {WasteBalanceService} service
 * @returns {Promise<PackagingRecyclingNote>}
 */
export const catchUpPrnProjection = async (prn, service) => {
  const catchupEvents = await service.prnCatchupEvents({
    organisationId: prn.organisation.id,
    registrationId: prn.registrationId,
    accreditationId: prn.accreditation.id,
    prnId: prn.id,
    afterEventNumber: prn.lastAppliedEventNumber ?? 0
  })

  return applyCatchupEventsToPrn(prn, catchupEvents)
}

/**
 * Catches a fetched PRN up so read callers receive the fully-formed document
 * without touching the event stream themselves. A missing or soft-deleted
 * document short-circuits with no stream query: a deleted PRN is terminal and
 * has no further events to project.
 *
 * @param {PackagingRecyclingNote | null} prn
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 * @returns {Promise<PackagingRecyclingNote | null>}
 */
const catchUpFetchedPrn = async (prn, ledgerRepository) => {
  if (!prn || prn.status.currentStatus === PRN_STATUS.DELETED) {
    return prn
  }

  return catchUpPrnProjection(prn, createWasteBalanceService(ledgerRepository))
}

/**
 * Reads a PRN by id and catches its projection up to the stream.
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
  return catchUpFetchedPrn(prn, ledgerRepository)
}

/**
 * Reads a PRN by its public number and catches its projection up to the
 * stream. The caller decides the next transition from the returned status, so
 * folding here keeps that decision off a stale document.
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
  return catchUpFetchedPrn(prn, ledgerRepository)
}

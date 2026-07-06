import Boom from '@hapi/boom'

import { prnMetrics } from './metrics.js'
import {
  applyPrnBalanceCommand,
  prnCommandFor
} from './update-status-balance-effects.js'
import {
  PRN_STATUS,
  validateTransition,
  assertAccreditationNotSuspended
} from '#packaging-recycling-notes/domain/model.js'
import { generatePrnNumber } from '#packaging-recycling-notes/domain/prn-number-generator.js'
import { PrnNumberConflictError } from '#packaging-recycling-notes/repository/port.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { foldPrnFromTailEvents } from './fold-prn-from-tail-events.js'

/** Suffixes A-Z for PRN-number collision avoidance on issuance */
const COLLISION_SUFFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository
 * @typedef {ReturnType<typeof createWasteBalanceService>} WasteBalanceService
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PrnStatus} PrnStatus
 */

/**
 * The shared context handed to each write path. The ledger path and the
 * no-balance-effect discard write consume different subsets.
 *
 * @typedef {Object} PrnWriteContext
 * @property {PackagingRecyclingNotesRepository} prnRepository
 * @property {OrganisationsRepository} organisationsRepository
 * @property {WasteBalanceService} service
 * @property {import('#common/hapi-types.js').TypedLogger} logger
 * @property {PackagingRecyclingNote} prn
 * @property {import('#packaging-recycling-notes/repository/port.js').UpdateStatusParams} updateParams
 * @property {PrnStatus} newStatus
 * @property {string} organisationId
 * @property {string} registrationId
 * @property {string} accreditationId
 * @property {{ id: string; name: string; email?: string }} user
 * @property {PrnStatus} currentStatus
 * @property {Date} now
 * @property {string} id
 */

/**
 * Persist a projected PRN, retrying issuance with new PRN number suffixes when
 * the existing one collides. The projection's `prnNumber` is the only field that
 * changes between attempts.
 *
 * @param {Object} params
 * @param {PackagingRecyclingNotesRepository} params.prnRepository
 * @param {PackagingRecyclingNote} params.projection
 * @param {number} params.expectedVersion
 * @param {{ regulator: string, isExport: boolean, accreditationYear: number }} params.prnNumberParams
 * @returns {Promise<PackagingRecyclingNote>}
 */
async function persistProjectionWithIssuanceRetry({
  prnRepository,
  projection,
  expectedVersion,
  prnNumberParams
}) {
  const suffixAttempts = [undefined, ...COLLISION_SUFFIXES]

  for (const suffix of suffixAttempts) {
    const prnNumber = generatePrnNumber({ ...prnNumberParams, suffix })

    try {
      const result = await prnRepository.persistProjection({
        projection: { ...projection, prnNumber },
        expectedVersion
      })
      if (!result) {
        throw Boom.badImplementation('Failed to persist PRN projection')
      }
      return result
    } catch (error) {
      if (error instanceof PrnNumberConflictError) {
        continue
      }
      throw error
    }
  }

  throw new Error('Unable to generate unique PRN number after all retries')
}

/**
 * Event-first write for a status transition. The balance-affecting events are
 * appended to the stream, then folded onto
 * the in-memory PRN, then the resulting projection is persisted. There is no
 * compensation: a partial failure (event appended, doc not persisted) is
 * recovered by the read-side catch-up, which folds events after the watermark
 * on the next read.
 */
async function performStreamWrite({
  prnRepository,
  organisationsRepository,
  service,
  logger,
  prn,
  currentStatus,
  newStatus,
  organisationId,
  registrationId,
  accreditationId,
  id,
  user
}) {
  // The suspension check is hoisted ahead of the stream append so a suspended
  // accreditation is never debited. The fetched accreditation is reused to
  // stamp the PRN number on the issuance path.
  let accreditation
  if (newStatus === PRN_STATUS.AWAITING_ACCEPTANCE) {
    accreditation = await organisationsRepository.findAccreditationById(
      organisationId,
      accreditationId
    )
    assertAccreditationNotSuspended(accreditation)
  }

  const ledgerEvents = await applyPrnBalanceCommand(service, logger, {
    currentStatus,
    newStatus,
    ledgerId: { organisationId, registrationId, accreditationId },
    prnId: id,
    tonnage: prn.tonnage,
    createdBy: user
  })

  const projection = foldPrnFromTailEvents(prn, ledgerEvents)

  if (newStatus === PRN_STATUS.AWAITING_ACCEPTANCE) {
    return persistProjectionWithIssuanceRetry({
      prnRepository,
      projection,
      expectedVersion: prn.version,
      prnNumberParams: {
        regulator: accreditation.submittedToRegulator,
        isExport: prn.isExport,
        accreditationYear: prn.accreditation.accreditationYear
      }
    })
  }

  const persisted = await prnRepository.persistProjection({
    projection,
    expectedVersion: prn.version
  })
  if (!persisted) {
    throw Boom.badImplementation('Failed to persist PRN projection')
  }
  return persisted
}

/**
 * Ledger-path write. Computes the stream events the transition emits and hands
 * them to the event-first write. On the ledger path every status transition
 * MUST produce at least one event — the fold is the projection of those events
 * onto the PRN doc, so no events means no projection, which would mean an
 * unrecoverable doc/stream divergence. Pre-creation transitions
 * (DRAFT→DISCARDED) are filtered out before this branch is reached.
 */
async function performLedgerWrite(ctx) {
  const { currentStatus, newStatus, accreditationId } = ctx

  /* c8 ignore next 5 - defensive: the only legal transition with no balance command (DRAFT→DISCARDED) is handled before this branch */
  if (!prnCommandFor(currentStatus, newStatus)) {
    throw Boom.badImplementation(
      `No stream events for transition ${currentStatus} -> ${newStatus} on ledger accreditation ${accreditationId}`
    )
  }

  return performStreamWrite(ctx)
}

/**
 * Write a status transition that has no balance effect: the PRN document's
 * status is stamped directly with no stream event. Used for DRAFT→DISCARDED,
 * where a never-issued draft is discarded.
 *
 * @param {PrnWriteContext} ctx
 * @returns {Promise<PackagingRecyclingNote>}
 */
const performDiscardWrite = async ({ prnRepository, updateParams }) => {
  const updatedPrn = await prnRepository.updateStatus(updateParams)
  if (!updatedPrn) {
    throw Boom.badImplementation('Failed to update PRN status')
  }
  return updatedPrn
}

/**
 * Updates PRN status with all business logic
 *
 * @param {Object} params
 * @param {PackagingRecyclingNotesRepository} params.prnRepository
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {import('#common/hapi-types.js').TypedLogger} params.logger
 * @param {string} params.id
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {string} params.accreditationId
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnStatus} params.newStatus
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnActor} params.actor
 * @param {{ id: string; name: string; email?: string }} params.user
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} [params.providedPrn] - Optional pre-fetched PRN to avoid duplicate fetch
 * @param {Date} [params.updatedAt] - Optional timestamp override (defaults to now)
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
 */
export async function updatePrnStatus({
  prnRepository,
  ledgerRepository,
  organisationsRepository,
  logger,
  id,
  organisationId,
  registrationId,
  accreditationId,
  newStatus,
  actor,
  user,
  providedPrn,
  updatedAt
}) {
  const prn = providedPrn ?? (await prnRepository.findById(id))

  if (
    !prn ||
    prn.organisation.id !== organisationId ||
    prn.accreditation.id !== accreditationId
  ) {
    throw Boom.notFound(`PRN not found: ${id}`)
  }

  const currentStatus = prn.status.currentStatus
  validateTransition(currentStatus, newStatus, actor)

  const now = updatedAt ?? new Date()
  const updateParams = {
    id,
    version: prn.version,
    status: newStatus,
    updatedBy: { id: user.id, name: user.name },
    updatedAt: now,
    lastAppliedEventNumber: prn.lastAppliedEventNumber
  }

  const ctx = {
    prnRepository,
    organisationsRepository,
    service: createWasteBalanceService(ledgerRepository),
    logger,
    prn,
    updateParams,
    newStatus,
    organisationId,
    registrationId,
    accreditationId,
    user,
    currentStatus,
    now,
    id
  }

  const updatedPrn =
    currentStatus === PRN_STATUS.DRAFT && newStatus === PRN_STATUS.DISCARDED
      ? await performDiscardWrite(ctx)
      : await performLedgerWrite(ctx)

  await prnMetrics.recordStatusTransition({
    fromStatus: currentStatus,
    toStatus: newStatus,
    material: prn.accreditation.material,
    isExport: prn.isExport
  })

  return updatedPrn
}

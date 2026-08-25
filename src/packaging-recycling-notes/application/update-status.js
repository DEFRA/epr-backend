import Boom from '@hapi/boom'

import { prnMetrics } from './metrics.js'
import {
  applyPrnTransition,
  prnCommandFor
} from './update-status-balance-effects.js'
import {
  CANCELLED_PRN_STATUSES,
  PRN_STATUS,
  validateTransition
} from '#packaging-recycling-notes/domain/model.js'
import { generatePrnNumber } from '#packaging-recycling-notes/domain/prn-number-generator.js'
import { selectObligationYearForAcceptance } from '#packaging-recycling-notes/domain/obligation-year.js'
import { PrnNumberConflictError } from '#packaging-recycling-notes/repository/port.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { foldPrnFromTailEvents } from './fold-prn-from-tail-events.js'
import { projectPrnFromStreamTail } from './get-projected-prn.js'

/** Suffixes A-Z for PRN-number collision avoidance on issuance */
const COLLISION_SUFFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository
 * @typedef {ReturnType<typeof createWasteBalanceService>} WasteBalanceService
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PrnStatus} PrnStatus
 * @typedef {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} WasteBalanceLedgerId
 * @typedef {import('#reports/application/prn-cancellation-events.js').OnPrnCancelled} OnPrnCancelled
 */

/**
 * Raises the `onCancelled` PRN event for any transition into a cancelled status, so interested domains (e.g. reports) can react; a no-op otherwise.
 *
 * @param {{ onCancelled: OnPrnCancelled }} prnEvents
 * @param {PrnStatus} newStatus
 * @param {PackagingRecyclingNote} updatedPrn
 */
async function notifyPrnCancelled(prnEvents, newStatus, updatedPrn) {
  if (!CANCELLED_PRN_STATUSES.has(newStatus)) {
    return
  }

  const issued =
    /** @type {import('#packaging-recycling-notes/domain/model.js').BusinessOperation} */ (
      updatedPrn.status.issued
    )

  await prnEvents.onCancelled({
    organisationId: updatedPrn.organisation.id,
    registrationId: updatedPrn.registrationId,
    prnId: updatedPrn.id,
    issuedAt: new Date(issued.at).toISOString()
  })
}

/**
 * The shared context handed to each write path. The ledger path and the
 * no-balance-effect discard write consume different subsets.
 *
 * The identity is an accreditation's, not a registration's: this path runs only
 * for accredited streams, so `accreditationId` is narrowed to non-null — the
 * same intersection `applyPrnTransition` takes as its `ledgerId`.
 *
 * @typedef {WasteBalanceLedgerId & { accreditationId: string } & {
 *   prnRepository: PackagingRecyclingNotesRepository,
 *   organisationsRepository: OrganisationsRepository,
 *   service: WasteBalanceService,
 *   logger: import('#common/hapi-types.js').TypedLogger,
 *   prn: PackagingRecyclingNote,
 *   updateParams: import('#packaging-recycling-notes/repository/port.js').UpdateStatusParams,
 *   newStatus: PrnStatus,
 *   user: { id: string, name: string, email?: string },
 *   actor: import('#packaging-recycling-notes/domain/model.js').PrnActor,
 *   now: Date,
 *   id: string,
 *   obligationYear?: number
 * }} PrnWriteContext
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
 * Event-first write for a status transition. The transition is ruled on and the
 * balance-affecting events appended in one ledger command, the events are then
 * folded onto the PRN, and the resulting projection is persisted. There is no
 * compensation: a partial failure (events appended, doc not persisted) is
 * recovered by the read-side catch-up, which folds events after the watermark
 * on the next read.
 *
 * The fold is onto the projection the ruling was made against, not onto the
 * fetched document — they differ exactly when the document had fallen behind
 * the stream, and folding onto the document would drop the events it had yet to
 * see.
 *
 * @param {PrnWriteContext} ctx
 * @returns {Promise<{ updatedPrn: PackagingRecyclingNote, fromStatus: PrnStatus }>}
 */
async function performStreamWrite({
  prnRepository,
  organisationsRepository,
  service,
  logger,
  prn,
  newStatus,
  actor,
  organisationId,
  registrationId,
  accreditationId,
  now,
  user,
  obligationYear
}) {
  // Fetched here because the issuance path stamps the PRN number from it;
  // whether it permits issuing is ruled on with the transition.
  const accreditation =
    newStatus === PRN_STATUS.AWAITING_ACCEPTANCE
      ? await organisationsRepository.findAccreditationById(
          organisationId,
          accreditationId
        )
      : undefined

  /* c8 ignore next 6 - defensive: findAccreditationById resolves an accreditation or throws, so a nullish one means the repository broke its contract */
  if (newStatus === PRN_STATUS.AWAITING_ACCEPTANCE && !accreditation) {
    throw Boom.badImplementation(
      `Accreditation ${accreditationId} could not be read for the issuance of PRN ${prn.id}`
    )
  }

  const selectedObligationYear = selectObligationYearForAcceptance(
    prn,
    obligationYear
  )

  const { events, projection, fromStatus } = await applyPrnTransition(
    service,
    logger,
    {
      prn,
      ledgerId: { organisationId, registrationId, accreditationId },
      newStatus,
      actor,
      accreditation,
      tonnage: prn.tonnage,
      createdBy: user,
      now,
      obligationYear: selectedObligationYear
    }
  )

  const updated = foldPrnFromTailEvents(projection, events)

  if (accreditation) {
    return {
      updatedPrn: await persistProjectionWithIssuanceRetry({
        prnRepository,
        projection: updated,
        expectedVersion: prn.version,
        prnNumberParams: {
          regulator: accreditation.submittedToRegulator,
          isExport: prn.isExport,
          accreditationYear: prn.accreditation.accreditationYear
        }
      }),
      fromStatus
    }
  }

  const persisted = await prnRepository.persistProjection({
    projection: updated,
    expectedVersion: prn.version
  })
  if (!persisted) {
    throw Boom.badImplementation('Failed to persist PRN projection')
  }
  return { updatedPrn: persisted, fromStatus }
}

/**
 * Write a status transition that has no balance effect: the PRN document's
 * status is stamped directly with no stream event. Used for DRAFT→DISCARDED,
 * where a never-issued draft is discarded.
 *
 * The rule runs against the projected PRN. A draft whose creation event reached
 * the stream but not the document is really awaiting authorisation, and
 * discarding it would strand the tonnage its creation ringfenced.
 *
 * Appending no event means this write contends for no ledger slot, so it is
 * serialised against a concurrent write only by the document's own version.
 *
 * @param {PrnWriteContext} ctx
 * @returns {Promise<{ updatedPrn: PackagingRecyclingNote, fromStatus: PrnStatus }>}
 */
const performDiscardWrite = async ({
  prnRepository,
  service,
  prn,
  newStatus,
  actor,
  updateParams
}) => {
  const projection = await projectPrnFromStreamTail(prn, service)
  const fromStatus = projection.status.currentStatus

  validateTransition(fromStatus, newStatus, actor)

  /* c8 ignore next 6 - defensive: the caller routes only balance-effect-free transitions here, and the state machine has exactly one */
  if (prnCommandFor(fromStatus, newStatus)) {
    throw Boom.badImplementation(
      `${fromStatus} -> ${newStatus} has a balance effect but took the write path that appends no event`
    )
  }

  const updatedPrn = await prnRepository.updateStatus(updateParams)
  if (!updatedPrn) {
    throw Boom.badImplementation('Failed to update PRN status')
  }
  return { updatedPrn, fromStatus }
}

/**
 * Updates PRN status with all business logic
 *
 * @param {Object} params
 * @param {PackagingRecyclingNotesRepository} params.prnRepository
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {{ onCancelled: OnPrnCancelled }} params.prnEvents
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
 * @param {number} [params.obligationYear] - Optional obligation year selected during external acceptance
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
 */
export async function updatePrnStatus({
  prnRepository,
  ledgerRepository,
  organisationsRepository,
  prnEvents,
  logger,
  id,
  organisationId,
  registrationId,
  accreditationId,
  newStatus,
  actor,
  user,
  providedPrn,
  updatedAt,
  obligationYear
}) {
  const prn = await resolvePrnForUpdate({
    prnRepository,
    id,
    organisationId,
    accreditationId,
    providedPrn
  })

  const ctx = buildWriteContext({
    prnRepository,
    ledgerRepository,
    organisationsRepository,
    logger,
    prn,
    newStatus,
    actor,
    organisationId,
    registrationId,
    accreditationId,
    user,
    id,
    updatedAt,
    obligationYear
  })

  // DRAFT→DISCARDED is the state machine's only transition with no balance
  // effect, and DISCARDED is reachable from nowhere else, so the requested
  // status alone picks the write path. Which transition this actually is gets
  // ruled on inside the path.
  const { updatedPrn, fromStatus } =
    newStatus === PRN_STATUS.DISCARDED
      ? await performDiscardWrite(ctx)
      : await performStreamWrite(ctx)

  await prnMetrics.recordStatusTransition({
    fromStatus,
    toStatus: newStatus,
    material: prn.accreditation.material,
    isExport: prn.isExport
  })

  try {
    await notifyPrnCancelled(prnEvents, newStatus, updatedPrn)
  } catch (error) {
    // Best-effort: the PRN transition is already committed, so don't fail the caller for a stale-notification error.
    logger.error({
      err: error,
      message: `PRN-cancellation notification failed for ${updatedPrn.id}; PRN status is already committed`
    })
  }

  return updatedPrn
}

/**
 * Fetches (or reuses) the PRN under update and asserts it belongs to the
 * caller's organisation/accreditation.
 *
 * @param {Object} params
 * @param {PackagingRecyclingNotesRepository} params.prnRepository
 * @param {string} params.id
 * @param {string} params.organisationId
 * @param {string} params.accreditationId
 * @param {PackagingRecyclingNote} [params.providedPrn]
 * @returns {Promise<PackagingRecyclingNote>}
 */
async function resolvePrnForUpdate({
  prnRepository,
  id,
  organisationId,
  accreditationId,
  providedPrn
}) {
  const prn = providedPrn ?? (await prnRepository.findById(id))

  if (
    !prn ||
    prn.organisation.id !== organisationId ||
    prn.accreditation.id !== accreditationId
  ) {
    throw Boom.notFound(`PRN not found: ${id}`)
  }

  return prn
}

/**
 * Builds the shared write context (`PrnWriteContext`) handed to
 * `performDiscardWrite`/`performStreamWrite`.
 *
 * @param {Object} params
 * @param {PackagingRecyclingNotesRepository} params.prnRepository
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {import('#common/hapi-types.js').TypedLogger} params.logger
 * @param {PackagingRecyclingNote} params.prn
 * @param {PrnStatus} params.newStatus
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnActor} params.actor
 * @param {string} params.organisationId
 * @param {string} params.registrationId
 * @param {string} params.accreditationId
 * @param {{ id: string; name: string; email?: string }} params.user
 * @param {string} params.id
 * @param {Date} [params.updatedAt]
 * @param {number} [params.obligationYear]
 * @returns {PrnWriteContext}
 */
function buildWriteContext({
  prnRepository,
  ledgerRepository,
  organisationsRepository,
  logger,
  prn,
  newStatus,
  actor,
  organisationId,
  registrationId,
  accreditationId,
  user,
  id,
  updatedAt,
  obligationYear
}) {
  const now = updatedAt ?? new Date()
  const updateParams = {
    id,
    version: prn.version,
    status: newStatus,
    updatedBy: { id: user.id, name: user.name },
    updatedAt: now,
    lastAppliedEventNumber: prn.lastAppliedEventNumber
  }

  return {
    prnRepository,
    organisationsRepository,
    service: createWasteBalanceService(ledgerRepository),
    logger,
    prn,
    updateParams,
    newStatus,
    actor,
    organisationId,
    registrationId,
    accreditationId,
    user,
    now,
    id,
    obligationYear
  }
}

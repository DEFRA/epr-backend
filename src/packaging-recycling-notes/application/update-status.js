import Boom from '@hapi/boom'

import { prnMetrics } from './metrics.js'
import {
  logWasteBalanceUpdate,
  LOG_OPERATION_BY_EVENT_KIND,
  toTransitionError
} from './update-status-reporting.js'
import {
  CANCELLED_PRN_STATUSES,
  PRN_STATUS
} from '#packaging-recycling-notes/domain/model.js'
import { decidePrnTransition } from '#packaging-recycling-notes/domain/prn-transition.js'
import { generatePrnNumber } from '#packaging-recycling-notes/domain/prn-number-generator.js'
import { selectObligationYearForAcceptance } from '#packaging-recycling-notes/domain/obligation-year.js'
import { PrnNumberConflictError } from '#packaging-recycling-notes/repository/port.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { foldPrnFromTailEvents } from '#packaging-recycling-notes/domain/fold-prn-from-tail-events.js'
import { projectPrnFromCatchupEvents } from './get-projected-prn.js'

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
 * Everything a PRN status write needs: the repositories and service it reaches
 * through, and the transition it is making.
 *
 * The identity is an accreditation's, not a registration's: this path runs only
 * for accredited streams, so `accreditationId` is narrowed to non-null — the
 * same intersection the ledger takes as its `ledgerId`.
 *
 * @typedef {WasteBalanceLedgerId & { accreditationId: string } & {
 *   prnRepository: PackagingRecyclingNotesRepository,
 *   organisationsRepository: OrganisationsRepository,
 *   service: WasteBalanceService,
 *   logger: import('#common/hapi-types.js').TypedLogger,
 *   prn: PackagingRecyclingNote,
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
 * Phase 1 — gather. The ledger is folded first and every other read follows it,
 * so nothing the ruling is made against is older than the head the events would
 * land on (PAE-1844). `beginPrnCommand` keeps that head captured in the append
 * it hands back, so phase 3 cannot commit at a head this call did not fold at.
 *
 * The accreditation is read only on the issuance path, which is the only phase
 * that stamps the PRN number from it; whether it permits issuing is ruled on
 * with the transition. Reading it here rather than ahead of the fold is what
 * puts the accreditation check on state no older than the events it authorises.
 * Carrying it in an object rather than beside an `undefined` keeps the later
 * branch a statement about the transition rather than about what was fetched.
 *
 * Every transition gathers the same way, including the one that appends
 * nothing: it opens a ledger command and leaves the `append` it was handed
 * unused. That write still contends for no ledger slot and is serialised only
 * by the document version, as `persistStatusChange` says.
 *
 * @param {PrnWriteContext} ctx
 * @param {import('#waste-balances/repository/ledger-schema.js').PrnAcceptedPayload} payload
 * @returns {Promise<import('#waste-balances/application/waste-balance-service.js').PrnCommand & {
 *   projection: PackagingRecyclingNote,
 *   fromStatus: PrnStatus,
 *   issuance: { accreditation: import('#domain/organisations/accreditation.js').Accreditation } | undefined
 * }>}
 */
async function gatherTransitionState(
  {
    service,
    organisationsRepository,
    prn,
    newStatus,
    organisationId,
    registrationId,
    accreditationId,
    user
  },
  payload
) {
  const { balance, append } = await service.beginPrnCommand(
    { organisationId, registrationId, accreditationId },
    payload,
    user
  )

  const projection = await projectPrnFromCatchupEvents(prn, service)

  const issuance =
    newStatus === PRN_STATUS.AWAITING_ACCEPTANCE
      ? {
          accreditation: await organisationsRepository.findAccreditationById(
            organisationId,
            accreditationId
          )
        }
      : undefined

  return {
    balance,
    append,
    projection,
    fromStatus: projection.status.currentStatus,
    issuance
  }
}

/**
 * Phase 3, ledger arm — append the decided events, fold them onto the PRN, and
 * persist the resulting projection. There is no compensation: a partial failure
 * (events appended, doc not persisted) is recovered by the read-side catch-up,
 * which folds events after the watermark on the next read.
 *
 * The fold is onto the projection the ruling was made against, not onto the
 * fetched document — they differ exactly when the document had fallen behind
 * the stream, and folding onto the document would drop the events it had yet to
 * see.
 *
 * @param {Object} params
 * @param {PackagingRecyclingNotesRepository} params.prnRepository
 * @param {import('#common/hapi-types.js').TypedLogger} params.logger
 * @param {PackagingRecyclingNote} params.prn
 * @param {PackagingRecyclingNote} params.projection
 * @param {PrnStatus} params.fromStatus
 * @param {PrnStatus} params.newStatus
 * @param {{ accreditation: import('#domain/organisations/accreditation.js').Accreditation } | undefined} params.issuance
 * @param {import('#waste-balances/repository/ledger-port.js').LedgerEvent[]} params.events
 * @returns {Promise<PackagingRecyclingNote>}
 */
async function persistAppendedEvents({
  prnRepository,
  logger,
  prn,
  projection,
  fromStatus,
  newStatus,
  issuance,
  events
}) {
  for (const event of events) {
    logWasteBalanceUpdate(
      logger,
      LOG_OPERATION_BY_EVENT_KIND[event.kind],
      prn.id,
      prn.tonnage,
      fromStatus,
      newStatus
    )
  }

  const updated = foldPrnFromTailEvents(projection, events)

  if (issuance) {
    return persistProjectionWithIssuanceRetry({
      prnRepository,
      projection: updated,
      expectedVersion: prn.version,
      prnNumberParams: {
        regulator: issuance.accreditation.submittedToRegulator,
        isExport: prn.isExport,
        accreditationYear: prn.accreditation.accreditationYear
      }
    })
  }

  const persisted = await prnRepository.persistProjection({
    projection: updated,
    expectedVersion: prn.version
  })
  if (!persisted) {
    throw Boom.badImplementation('Failed to persist PRN projection')
  }
  return persisted
}

/**
 * Phase 3, stated arm — stamp the status onto the PRN document directly, for
 * the one transition that appends nothing (DRAFT→DISCARDED). Appending no event
 * means this write contends for no ledger slot, so it is serialised against a
 * concurrent write only by the document's own version.
 *
 * @param {Object} params
 * @param {PackagingRecyclingNotesRepository} params.prnRepository
 * @param {PackagingRecyclingNote} params.prn
 * @param {string} params.id
 * @param {{ to: PrnStatus, at: Date, by: import('#packaging-recycling-notes/domain/prn-transition.js').StatusChangeActor }} params.statusChange
 * @returns {Promise<PackagingRecyclingNote>}
 */
async function persistStatusChange({ prnRepository, prn, id, statusChange }) {
  const updatedPrn = await prnRepository.updateStatus({
    id,
    version: prn.version,
    status: statusChange.to,
    updatedBy: statusChange.by,
    updatedAt: statusChange.at,
    lastAppliedEventNumber: prn.lastAppliedEventNumber
  })
  if (!updatedPrn) {
    throw Boom.badImplementation('Failed to update PRN status')
  }
  return updatedPrn
}

/**
 * A PRN status write, as the three phases it is and nothing else: gather the
 * state and context, rule on the transition, then persist what the ruling
 * named. Which of the two write paths runs is the domain's answer, not a branch
 * taken on the requested status ahead of the ruling. Within the ledger arm,
 * issuance still takes the PRN-numbering persist off the requested status,
 * which is a numbering concern rather than a balance one.
 *
 * @param {PrnWriteContext} ctx
 * @returns {Promise<{ updatedPrn: PackagingRecyclingNote, fromStatus: PrnStatus }>}
 */
async function performPrnWrite(ctx) {
  const {
    prnRepository,
    logger,
    prn,
    newStatus,
    actor,
    accreditationId,
    user,
    now,
    id,
    obligationYear
  } = ctx

  const selectedObligationYear = selectObligationYearForAcceptance(
    prn,
    obligationYear
  )
  const payload = {
    prnId: prn.id,
    amount: prn.tonnage,
    ...(selectedObligationYear === undefined
      ? {}
      : { obligationYear: selectedObligationYear })
  }

  const { balance, append, projection, fromStatus, issuance } =
    await gatherTransitionState(ctx, payload)

  const outcome = decidePrnTransition({
    fromStatus,
    newStatus,
    actor,
    accreditation: issuance?.accreditation,
    accreditationYear: prn.accreditation.accreditationYear,
    now,
    balance,
    payload,
    updatedBy: { id: user.id, name: user.name }
  })

  if ('error' in outcome) {
    throw toTransitionError(outcome.error, accreditationId)
  }

  if ('statusChange' in outcome) {
    return {
      updatedPrn: await persistStatusChange({
        prnRepository,
        prn,
        id,
        statusChange: outcome.statusChange
      }),
      fromStatus
    }
  }

  return {
    updatedPrn: await persistAppendedEvents({
      prnRepository,
      logger,
      prn,
      projection,
      fromStatus,
      newStatus,
      issuance,
      events: await append(outcome.balanceEvents)
    }),
    fromStatus
  }
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

  const { updatedPrn, fromStatus } = await performPrnWrite(ctx)

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
 * Builds the write context (`PrnWriteContext`) `performPrnWrite` runs on.
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
  return {
    prnRepository,
    organisationsRepository,
    service: createWasteBalanceService(ledgerRepository),
    logger,
    prn,
    newStatus,
    actor,
    organisationId,
    registrationId,
    accreditationId,
    user,
    now: updatedAt ?? new Date(),
    id,
    obligationYear
  }
}

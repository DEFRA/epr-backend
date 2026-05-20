import Boom from '@hapi/boom'

import { prnMetrics } from './metrics.js'
import { applyWasteBalanceEffects } from './update-status-balance-effects.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  PRN_STATUS,
  validateTransition,
  assertAccreditationNotSuspended
} from '#packaging-recycling-notes/domain/model.js'
import { generatePrnNumber } from '#packaging-recycling-notes/domain/prn-number-generator.js'
import { PrnNumberConflictError } from '#packaging-recycling-notes/repository/port.js'

/** Suffixes A-Z for collision avoidance */
const COLLISION_SUFFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const STATUS_OPERATION_SLOT = Object.freeze({
  [PRN_STATUS.AWAITING_AUTHORISATION]: 'created',
  [PRN_STATUS.ACCEPTED]: 'accepted',
  [PRN_STATUS.AWAITING_CANCELLATION]: 'rejected',
  [PRN_STATUS.DELETED]: 'deleted',
  [PRN_STATUS.CANCELLED]: 'cancelled'
})

/**
 * Transition keys (currentStatus|newStatus) for the post-CAS path that needs a
 * PRN rollback when the balance side-effect throws. Kept as a typed union so
 * adding a new key without a matching entry in ROLLBACK_METHOD_BY_TRANSITION
 * is a tsc error.
 *
 * @typedef {`${typeof PRN_STATUS.AWAITING_AUTHORISATION}|${typeof PRN_STATUS.AWAITING_ACCEPTANCE}`
 *   | `${typeof PRN_STATUS.AWAITING_AUTHORISATION}|${typeof PRN_STATUS.DELETED}`
 *   | `${typeof PRN_STATUS.AWAITING_CANCELLATION}|${typeof PRN_STATUS.CANCELLED}`} PostCasRollbackTransition
 */

/**
 * @typedef {'rollbackIssuance' | 'rollbackPendingCancellation' | 'rollbackIssuedCancellation'} RollbackMethodName
 */

/**
 * Maps a (currentStatus -> newStatus) transition to the rollback method on the
 * PRN repository that reverses the forward write. Only post-CAS transitions
 * with a follow-on balance side-effect appear here; creation is handled by
 * crediting the balance back rather than rolling the PRN.
 *
 * tsc enforces:
 *   - every key in PostCasRollbackTransition has an entry (exhaustiveness)
 *   - no extra keys are present (no orphan rollback entries)
 *   - every value is a valid RollbackMethodName
 * Keys are literal strings so tsc can verify them — computed template-literal
 * keys widen to string and lose the connection to the union. The keys are
 * still tied to PRN_STATUS because PostCasRollbackTransition resolves via
 * `typeof PRN_STATUS.*` — a value change in PRN_STATUS would tsc-error here.
 */
/** @type {Readonly<Record<PostCasRollbackTransition, RollbackMethodName>>} */
const ROLLBACK_METHOD_BY_TRANSITION = {
  'awaiting_authorisation|awaiting_acceptance': 'rollbackIssuance',
  'awaiting_authorisation|deleted': 'rollbackPendingCancellation',
  'awaiting_cancellation|cancelled': 'rollbackIssuedCancellation'
}

/**
 * @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository
 * @typedef {import('#waste-balances/repository/port.js').WasteBalancesRepository} WasteBalancesRepository
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 */

/**
 * Issues a PRN with retry logic for PRN number collisions.
 * Tries without suffix first, then A-Z on collision.
 *
 * @param {PackagingRecyclingNotesRepository} repository
 * @param {Object} updateParams - Parameters for updateStatus
 * @param {Object} prnParams - Parameters for PRN number generation
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
 */
async function issuePrnWithRetry(repository, updateParams, prnParams) {
  const suffixAttempts = [undefined, ...COLLISION_SUFFIXES]

  for (const suffix of suffixAttempts) {
    const prnNumber = generatePrnNumber({ ...prnParams, suffix })

    try {
      const result = await repository.updateStatus({
        ...updateParams,
        prnNumber
      })
      if (!result) {
        throw new Error('Failed to update PRN status')
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
 * Performs the repository write for a status transition.
 * Issuance (AWAITING_ACCEPTANCE) verifies the accreditation and
 * generates a unique PRN number; all other transitions just stamp
 * an operation slot and update.
 *
 * @param {Object} params
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
 */
async function applyStatusUpdate({
  prnRepository,
  organisationsRepository,
  prn,
  updateParams,
  newStatus,
  organisationId,
  accreditationId,
  user,
  now
}) {
  if (newStatus === PRN_STATUS.AWAITING_ACCEPTANCE) {
    updateParams.operation = {
      slot: 'issued',
      at: now,
      by: { id: user.id, name: user.name }
    }

    const accreditation = await organisationsRepository.findAccreditationById(
      organisationId,
      accreditationId
    )

    assertAccreditationNotSuspended(accreditation)

    return issuePrnWithRetry(prnRepository, updateParams, {
      regulator: accreditation.submittedToRegulator,
      isExport: prn.isExport,
      accreditationYear: prn.accreditation.accreditationYear
    })
  }

  const operationSlot = STATUS_OPERATION_SLOT[newStatus]
  if (operationSlot) {
    updateParams.operation = { slot: operationSlot, at: now, by: user }
  }

  const updatedPrn = await prnRepository.updateStatus(updateParams)
  if (!updatedPrn) {
    throw Boom.badImplementation('Failed to update PRN status')
  }
  return updatedPrn
}

/**
 * CDP ingest drops fields outside its allowlist (see cdp-log-types.js),
 * including bespoke top-level fields and any second error on the same entry.
 * Both errors are therefore logged as paired entries that share the same
 * event.reference (the prnId) and event.action so ops can correlate them,
 * with each entry's `err` populated for indexing.
 */
function logCompensationFailure(
  logger,
  prnId,
  fromStatus,
  toStatus,
  err,
  kind
) {
  logger.error({
    err,
    message: `${kind} for PRN ${prnId} (${fromStatus} -> ${toStatus})`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.DB,
      action: LOGGING_EVENT_ACTIONS.COMPENSATION_FAILURE,
      reference: prnId
    }
  })
}

/**
 * Records that a forward failure was caught and cleanly reversed. The forward
 * error is attached as `err` so it's indexed, and the event.reference is the
 * prnId so ops can find every compensation event for a given PRN regardless
 * of whether it ultimately succeeded or failed.
 */
function logCompensationSuccess(logger, prnId, fromStatus, toStatus, err) {
  logger.warn({
    err,
    message: `Forward write failed; compensation succeeded for PRN ${prnId} (${fromStatus} -> ${toStatus})`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.DB,
      action: LOGGING_EVENT_ACTIONS.COMPENSATION_SUCCESS,
      reference: prnId
    }
  })
}

/**
 * Runs `compensator` to undo a forward write that has already committed.
 * On success, logs a COMPENSATION_SUCCESS entry carrying the original forward
 * error so ops can spot patterns of recovered failures. If the compensator
 * itself throws, the failure is logged with full context (the original
 * forward error and the compensation error) but not rethrown — the caller
 * always sees the original forward error so the user-visible outcome stays
 * coherent. The log entries are what ops use to find PRNs left in an
 * inconsistent state for manual reconciliation.
 *
 * @param {() => Promise<unknown>} compensator
 * @param {Object} context
 * @param {Error} context.forwardError
 * @param {import('#common/hapi-types.js').TypedLogger} context.logger
 * @param {string} context.prnId
 * @param {string} context.fromStatus
 * @param {string} context.toStatus
 */
async function tryCompensate(compensator, context) {
  try {
    await compensator()
    logCompensationSuccess(
      context.logger,
      context.prnId,
      context.fromStatus,
      context.toStatus,
      context.forwardError
    )
  } catch (compensationError) {
    logCompensationFailure(
      context.logger,
      context.prnId,
      context.fromStatus,
      context.toStatus,
      context.forwardError,
      'Forward write failed; compensation triggered'
    )
    logCompensationFailure(
      context.logger,
      context.prnId,
      context.fromStatus,
      context.toStatus,
      compensationError,
      'Compensation failed; manual reconciliation required'
    )
  }
}

/**
 * Pre-flight balance debit, forward PRN write, and credit-back compensation
 * if the forward write fails. Pre-flight debit already proved the balance
 * exists, so the compensator calls the credit primitive directly rather than
 * going through the wrapper that would re-fetch.
 */
async function performCreation({
  prnRepository,
  organisationsRepository,
  wasteBalancesRepository,
  logger,
  prn,
  updateParams,
  balanceEffectsParams,
  newStatus,
  organisationId,
  accreditationId,
  user,
  currentStatus,
  now,
  id
}) {
  await applyWasteBalanceEffects(
    wasteBalancesRepository,
    logger,
    balanceEffectsParams
  )

  try {
    return await applyStatusUpdate({
      prnRepository,
      organisationsRepository,
      prn,
      updateParams,
      newStatus,
      organisationId,
      accreditationId,
      user,
      now
    })
  } catch (forwardError) {
    await tryCompensate(
      () =>
        wasteBalancesRepository.creditAvailableBalanceForPrnCancellation({
          accreditationId,
          organisationId,
          prnId: id,
          tonnage: prn.tonnage,
          userId: user.id
        }),
      {
        forwardError,
        logger,
        prnId: id,
        fromStatus: currentStatus,
        toStatus: newStatus
      }
    )
    throw forwardError
  }
}

/**
 * Forward PRN write followed by post-CAS balance effects, rolling the PRN
 * back via the transition-specific rollback method if the balance write
 * fails. The per-PRN CAS gates the balance write so concurrent writers
 * cannot double-debit or double-credit.
 */
async function performTransition({
  prnRepository,
  organisationsRepository,
  wasteBalancesRepository,
  logger,
  prn,
  updateParams,
  balanceEffectsParams,
  newStatus,
  organisationId,
  accreditationId,
  user,
  currentStatus,
  now,
  id
}) {
  const updatedPrn = await applyStatusUpdate({
    prnRepository,
    organisationsRepository,
    prn,
    updateParams,
    newStatus,
    organisationId,
    accreditationId,
    user,
    now
  })

  try {
    await applyWasteBalanceEffects(
      wasteBalancesRepository,
      logger,
      balanceEffectsParams
    )
  } catch (forwardError) {
    const transitionKey = /** @type {PostCasRollbackTransition} */ (
      `${currentStatus}|${newStatus}`
    )
    const rollbackMethod = ROLLBACK_METHOD_BY_TRANSITION[transitionKey]
    await tryCompensate(
      () =>
        prnRepository[rollbackMethod]({
          id,
          expectedVersion: updatedPrn.version,
          updatedBy: user,
          updatedAt: now
        }),
      {
        forwardError,
        logger,
        prnId: id,
        fromStatus: currentStatus,
        toStatus: newStatus
      }
    )
    throw forwardError
  }

  return updatedPrn
}

/**
 * Updates PRN status with all business logic
 *
 * @param {Object} params
 * @param {PackagingRecyclingNotesRepository} params.prnRepository
 * @param {WasteBalancesRepository} params.wasteBalancesRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {import('#common/hapi-types.js').TypedLogger} params.logger
 * @param {string} params.id
 * @param {string} params.organisationId
 * @param {string} params.accreditationId
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnStatus} params.newStatus
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnActor} params.actor
 * @param {{ id: string; name: string }} params.user
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} [params.providedPrn] - Optional pre-fetched PRN to avoid duplicate fetch
 * @param {Date} [params.updatedAt] - Optional timestamp override (defaults to now)
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
 */
export async function updatePrnStatus({
  prnRepository,
  wasteBalancesRepository,
  organisationsRepository,
  logger,
  id,
  organisationId,
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

  const balanceEffectsParams = {
    currentStatus,
    newStatus,
    accreditationId,
    organisationId,
    prnId: id,
    tonnage: prn.tonnage,
    userId: user.id
  }

  const now = updatedAt ?? new Date()
  const updateParams = {
    id,
    version: prn.version,
    status: newStatus,
    updatedBy: user,
    updatedAt: now
  }

  const perform =
    newStatus === PRN_STATUS.AWAITING_AUTHORISATION
      ? performCreation
      : performTransition

  const updatedPrn = await perform({
    prnRepository,
    organisationsRepository,
    wasteBalancesRepository,
    logger,
    prn,
    updateParams,
    balanceEffectsParams,
    newStatus,
    organisationId,
    accreditationId,
    user,
    currentStatus,
    now,
    id
  })

  await prnMetrics.recordStatusTransition({
    fromStatus: currentStatus,
    toStatus: newStatus,
    material: prn.accreditation.material,
    isExport: prn.isExport
  })

  return updatedPrn
}

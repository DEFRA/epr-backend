import Boom from '@hapi/boom'

import {
  creditFullBalanceIfNeeded,
  creditWasteBalanceIfNeeded,
  deductTotalBalanceIfNeeded,
  deductWasteBalanceIfNeeded,
  logWasteBalanceUpdate
} from './update-status-balance-effects.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  PRN_STATUS,
  assertAccreditationNotSuspended
} from '#packaging-recycling-notes/domain/model.js'
import { generatePrnNumber } from '#packaging-recycling-notes/domain/prn-number-generator.js'
import { PrnNumberConflictError } from '#packaging-recycling-notes/repository/port.js'

/**
 * @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository
 * @typedef {import('#waste-balances/repository/port.js').WasteBalancesRepository} WasteBalancesRepository
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PrnStatus} PrnStatus
 */

/** Suffixes A-Z for collision avoidance */
export const COLLISION_SUFFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

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
 * Embedded-path balance effects keyed by `${currentStatus}|${newStatus}`. The
 * embedded path predates event sourcing — it doesn't emit stream events, it
 * just mutates the balance document directly. Missing entry means the
 * transition is lifecycle-only (no balance change) and just stamps the PRN.
 */
const EMBEDDED_BALANCE_EFFECTS = Object.freeze({
  [`${PRN_STATUS.DRAFT}|${PRN_STATUS.AWAITING_AUTHORISATION}`]: {
    apply: deductWasteBalanceIfNeeded,
    log: 'deduct_available'
  },
  [`${PRN_STATUS.AWAITING_AUTHORISATION}|${PRN_STATUS.AWAITING_ACCEPTANCE}`]: {
    apply: deductTotalBalanceIfNeeded,
    log: 'deduct_total'
  },
  [`${PRN_STATUS.AWAITING_AUTHORISATION}|${PRN_STATUS.DELETED}`]: {
    apply: creditWasteBalanceIfNeeded,
    log: 'credit_available'
  },
  [`${PRN_STATUS.AWAITING_AUTHORISATION}|${PRN_STATUS.CANCELLED}`]: {
    apply: creditWasteBalanceIfNeeded,
    log: 'credit_available'
  },
  [`${PRN_STATUS.AWAITING_CANCELLATION}|${PRN_STATUS.CANCELLED}`]: {
    apply: creditFullBalanceIfNeeded,
    log: 'credit_full'
  }
})

/**
 * @typedef {Object} EmbeddedBalanceEffectParams
 * @property {WasteBalancesRepository} wasteBalancesRepository
 * @property {import('#common/hapi-types.js').TypedLogger} logger
 * @property {PrnStatus} currentStatus
 * @property {PrnStatus} newStatus
 * @property {{accreditationId: string, registrationId: string, organisationId: string, prnId: string, tonnage: number, userId: string}} params
 */

/**
 * Apply the embedded-path balance effect for a transition. No events are
 * generated; the balance document is mutated directly.
 *
 * @param {EmbeddedBalanceEffectParams} args
 */
async function applyEmbeddedBalanceEffect({
  wasteBalancesRepository,
  logger,
  currentStatus,
  newStatus,
  params
}) {
  const effect = EMBEDDED_BALANCE_EFFECTS[`${currentStatus}|${newStatus}`]
  if (!effect) {
    return
  }
  await effect.apply(wasteBalancesRepository, params)
  logWasteBalanceUpdate(
    logger,
    effect.log,
    params.prnId,
    params.tonnage,
    currentStatus,
    newStatus
  )
}

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
export async function applyStatusUpdate({
  prnRepository,
  organisationsRepository,
  prn,
  updateParams,
  newStatus,
  organisationId,
  accreditationId,
  user,
  now,
  accreditation: providedAccreditation
}) {
  if (newStatus === PRN_STATUS.AWAITING_ACCEPTANCE) {
    updateParams.operation = {
      slot: 'issued',
      at: now,
      by: { id: user.id, name: user.name }
    }

    const accreditation =
      providedAccreditation ??
      (await organisationsRepository.findAccreditationById(
        organisationId,
        accreditationId
      ))

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
export async function performCreation({
  prnRepository,
  organisationsRepository,
  wasteBalancesRepository,
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
}) {
  await applyEmbeddedBalanceEffect({
    wasteBalancesRepository,
    logger,
    currentStatus,
    newStatus,
    params: {
      accreditationId,
      registrationId,
      organisationId,
      prnId: id,
      tonnage: prn.tonnage,
      userId: user.id
    }
  })

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
          registrationId,
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
export async function performTransition({
  prnRepository,
  organisationsRepository,
  wasteBalancesRepository,
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
    await applyEmbeddedBalanceEffect({
      wasteBalancesRepository,
      logger,
      currentStatus,
      newStatus,
      params: {
        accreditationId,
        registrationId,
        organisationId,
        prnId: id,
        tonnage: prn.tonnage,
        userId: user.id
      }
    })
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
          updatedAt: now,
          lastAppliedEventNumber: updatedPrn.lastAppliedEventNumber
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

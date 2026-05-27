import Boom from '@hapi/boom'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'

/**
 * @typedef {import('#waste-balances/repository/port.js').WasteBalancesRepository} WasteBalancesRepository
 */

/**
 * Deducts available waste balance when creating a PRN.
 *
 * @param {WasteBalancesRepository} wasteBalancesRepository
 * @param {Object} params
 */
async function deductWasteBalanceIfNeeded(wasteBalancesRepository, params) {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    userId
  } = params
  const balance =
    await wasteBalancesRepository.findByAccreditationId(accreditationId)

  if (balance) {
    if ((balance.availableAmount ?? 0) < tonnage) {
      throw Boom.conflict('Insufficient available waste balance')
    }

    return wasteBalancesRepository.deductAvailableBalanceForPrnCreation({
      accreditationId,
      registrationId,
      organisationId,
      prnId,
      tonnage,
      userId
    })
  } else {
    throw Boom.badRequest(
      `No waste balance found for accreditation: ${accreditationId}`
    )
  }
}

/**
 * Deducts total waste balance when issuing a PRN.
 *
 * @param {WasteBalancesRepository} wasteBalancesRepository
 * @param {Object} params
 */
async function deductTotalBalanceIfNeeded(wasteBalancesRepository, params) {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    userId
  } = params
  const balance =
    await wasteBalancesRepository.findByAccreditationId(accreditationId)

  if (balance) {
    if ((balance.amount ?? 0) < tonnage) {
      throw Boom.conflict('Insufficient total waste balance')
    }

    return wasteBalancesRepository.deductTotalBalanceForPrnIssue({
      accreditationId,
      registrationId,
      organisationId,
      prnId,
      tonnage,
      userId
    })
  } else {
    throw Boom.badRequest(
      `No waste balance found for accreditation: ${accreditationId}`
    )
  }
}

/**
 * Credits available waste balance when cancelling a PRN from awaiting_authorisation.
 * Reverses the ringfencing that occurred when the PRN was created.
 *
 * @param {WasteBalancesRepository} wasteBalancesRepository
 * @param {Object} params
 */
async function creditWasteBalanceIfNeeded(wasteBalancesRepository, params) {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    userId
  } = params
  const balance =
    await wasteBalancesRepository.findByAccreditationId(accreditationId)

  if (balance) {
    return wasteBalancesRepository.creditAvailableBalanceForPrnCancellation({
      accreditationId,
      registrationId,
      organisationId,
      prnId,
      tonnage,
      userId
    })
  } else {
    throw Boom.badRequest(
      `No waste balance found for accreditation: ${accreditationId}`
    )
  }
}

/**
 * Credits both amount and availableAmount when cancelling an issued PRN.
 * Reverses both the creation ringfence and the issue deduction.
 *
 * @param {WasteBalancesRepository} wasteBalancesRepository
 * @param {Object} params
 */
async function creditFullBalanceIfNeeded(wasteBalancesRepository, params) {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    userId
  } = params
  const balance =
    await wasteBalancesRepository.findByAccreditationId(accreditationId)

  if (balance) {
    return wasteBalancesRepository.creditFullBalanceForIssuedPrnCancellation({
      accreditationId,
      registrationId,
      organisationId,
      prnId,
      tonnage,
      userId
    })
  } else {
    throw Boom.badRequest(
      `No waste balance found for accreditation: ${accreditationId}`
    )
  }
}

/**
 * Operational system log capturing that a waste balance write committed.
 *
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {string} operation
 * @param {string} prnId
 * @param {number} tonnage
 * @param {string} fromStatus
 * @param {string} toStatus
 */
function logWasteBalanceUpdate(
  logger,
  operation,
  prnId,
  tonnage,
  fromStatus,
  toStatus
) {
  logger.info({
    message: `Waste balance ${operation} for PRN ${prnId} (${fromStatus} -> ${toStatus}), tonnage ${tonnage}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.DB,
      action: LOGGING_EVENT_ACTIONS.WASTE_BALANCE_UPDATED,
      reference: prnId
    }
  })
}

/**
 * Applies waste balance side effects for a status transition.
 * Each transition type is mutually exclusive based on newStatus.
 *
 * @param {WasteBalancesRepository} wasteBalancesRepository
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {Object} params
 * @returns {Promise<number|null>} The stream event number applied by the firing
 *   transition (the watermark) on the ledger path, or `null` on the embedded
 *   path and when no balance effect fires.
 */
export async function applyWasteBalanceEffects(
  wasteBalancesRepository,
  logger,
  params
) {
  const { currentStatus, newStatus, ...balanceParams } = params
  const { prnId, tonnage } = balanceParams

  let lastAppliedEventNumber = null

  if (newStatus === PRN_STATUS.AWAITING_AUTHORISATION) {
    lastAppliedEventNumber = await deductWasteBalanceIfNeeded(
      wasteBalancesRepository,
      balanceParams
    )
    logWasteBalanceUpdate(
      logger,
      'deduct_available',
      prnId,
      tonnage,
      currentStatus,
      newStatus
    )
  }

  // AWAITING_AUTHORISATION -> CANCELLED is rejected by validateTransition; only the
  // DELETED leg is reachable here, but the OR is kept defensively as the credit
  // semantics are identical for both targets.
  if (
    (newStatus === PRN_STATUS.CANCELLED || newStatus === PRN_STATUS.DELETED) &&
    currentStatus === PRN_STATUS.AWAITING_AUTHORISATION
  ) {
    lastAppliedEventNumber = await creditWasteBalanceIfNeeded(
      wasteBalancesRepository,
      balanceParams
    )
    logWasteBalanceUpdate(
      logger,
      'credit_available',
      prnId,
      tonnage,
      currentStatus,
      newStatus
    )
  }

  if (
    newStatus === PRN_STATUS.CANCELLED &&
    currentStatus === PRN_STATUS.AWAITING_CANCELLATION
  ) {
    lastAppliedEventNumber = await creditFullBalanceIfNeeded(
      wasteBalancesRepository,
      balanceParams
    )
    logWasteBalanceUpdate(
      logger,
      'credit_full',
      prnId,
      tonnage,
      currentStatus,
      newStatus
    )
  }

  if (newStatus === PRN_STATUS.AWAITING_ACCEPTANCE) {
    lastAppliedEventNumber = await deductTotalBalanceIfNeeded(
      wasteBalancesRepository,
      balanceParams
    )
    logWasteBalanceUpdate(
      logger,
      'deduct_total',
      prnId,
      tonnage,
      currentStatus,
      newStatus
    )
  }

  return lastAppliedEventNumber
}

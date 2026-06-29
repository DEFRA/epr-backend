import Boom from '@hapi/boom'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  PRN_COMMAND_STATUS,
  PRN_COMMAND_REJECTION
} from '#waste-balances/domain/commands.js'

/**
 * @typedef {ReturnType<typeof import('#waste-balances/application/waste-balance-service.js').createWasteBalanceService>} WasteBalanceService
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PrnStatus} PrnStatus
 */

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
export function logWasteBalanceUpdate(
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
 * Maps a permitted status transition to the waste-balance service command it
 * runs and the operation label its system log carries. Transitions without an
 * entry have no balance effect. Keys must be transitions the state machine
 * (`PRN_STATUS_TRANSITIONS`) actually permits.
 *
 * @type {Record<string, { method: 'createPrn' | 'issuePrn' | 'cancelPrnCreation' | 'cancelIssuedPrn' | 'acceptPrn' | 'rejectPrn', logOperation: string }>}
 */
const TRANSITION_TO_COMMAND = Object.freeze({
  [`${PRN_STATUS.DRAFT}|${PRN_STATUS.AWAITING_AUTHORISATION}`]: {
    method: 'createPrn',
    logOperation: 'deduct_available'
  },
  [`${PRN_STATUS.AWAITING_AUTHORISATION}|${PRN_STATUS.AWAITING_ACCEPTANCE}`]: {
    method: 'issuePrn',
    logOperation: 'deduct_total'
  },
  [`${PRN_STATUS.AWAITING_ACCEPTANCE}|${PRN_STATUS.ACCEPTED}`]: {
    method: 'acceptPrn',
    logOperation: 'append_accepted'
  },
  [`${PRN_STATUS.AWAITING_ACCEPTANCE}|${PRN_STATUS.AWAITING_CANCELLATION}`]: {
    method: 'rejectPrn',
    logOperation: 'append_rejected'
  },
  [`${PRN_STATUS.AWAITING_AUTHORISATION}|${PRN_STATUS.DELETED}`]: {
    method: 'cancelPrnCreation',
    logOperation: 'credit_available'
  },
  [`${PRN_STATUS.AWAITING_CANCELLATION}|${PRN_STATUS.CANCELLED}`]: {
    method: 'cancelIssuedPrn',
    logOperation: 'credit_full'
  }
})

/**
 * The waste-balance command a status transition runs, or `undefined` when the
 * transition has no balance effect.
 *
 * @param {PrnStatus} currentStatus
 * @param {PrnStatus} newStatus
 */
export const prnCommandFor = (currentStatus, newStatus) =>
  TRANSITION_TO_COMMAND[`${currentStatus}|${newStatus}`]

/**
 * Turn a command rejection into the error its callers expect. The domain
 * decider reports the rejection as data; the contextual HTTP-shaped error is
 * built here, where the ledger identity is in hand.
 *
 * @type {Record<import('#waste-balances/domain/commands.js').PrnCommandRejection, (accreditationId: string) => Error>}
 */
const REJECTION_TO_ERROR = Object.freeze({
  [PRN_COMMAND_REJECTION.NO_LEDGER]: (accreditationId) =>
    Boom.badRequest(
      `No waste balance found for accreditation: ${accreditationId}`
    ),
  [PRN_COMMAND_REJECTION.INSUFFICIENT_AVAILABLE_BALANCE]: () =>
    Boom.conflict('Insufficient available waste balance'),
  [PRN_COMMAND_REJECTION.INSUFFICIENT_TOTAL_BALANCE]: () =>
    Boom.conflict('Insufficient total waste balance')
})

/**
 * Run the waste-balance command for a status transition through the service,
 * folding once and appending the decided events. A rejection becomes the
 * caller-facing error; a commit is logged and its appended stream events
 * returned for the projection fold. The slot index is the optimistic-concurrency
 * guard: a head that moved after the fold surfaces as a slot conflict and
 * propagates to the caller (ADR-0036).
 *
 * @param {WasteBalanceService} service
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {Object} command
 * @param {PrnStatus} command.currentStatus
 * @param {PrnStatus} command.newStatus
 * @param {import('#waste-balances/repository/stream-schema.js').WasteBalanceLedgerId & { accreditationId: string }} command.ledgerId
 * @param {string} command.prnId
 * @param {number} command.tonnage
 * @param {import('#waste-balances/repository/stream-schema.js').StreamUserSummary} command.createdBy
 * @returns {Promise<Array<import('#waste-balances/repository/stream-port.js').StreamEvent>>}
 */
export async function applyPrnBalanceCommand(
  service,
  logger,
  { currentStatus, newStatus, ledgerId, prnId, tonnage, createdBy }
) {
  const command = prnCommandFor(currentStatus, newStatus)

  const result = await service[command.method](
    ledgerId,
    { prnId, amount: tonnage },
    createdBy
  )

  if (result.status === PRN_COMMAND_STATUS.REJECTED) {
    throw REJECTION_TO_ERROR[result.reason](ledgerId.accreditationId)
  }

  logWasteBalanceUpdate(
    logger,
    command.logOperation,
    prnId,
    tonnage,
    currentStatus,
    newStatus
  )

  return result.events
}

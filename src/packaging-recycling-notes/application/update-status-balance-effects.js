import Boom from '@hapi/boom'

import {
  PRN_STATUS,
  validateTransition,
  assertAccreditationCanIssue
} from '#packaging-recycling-notes/domain/model.js'
import { assertCancellationAllowed } from '#packaging-recycling-notes/domain/cancellation.js'
import { projectPrnFromStreamTail } from './get-projected-prn.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  createPrn as decideCreatePrn,
  issuePrn as decideIssuePrn,
  cancelPrnCreation as decideCancelPrnCreation,
  cancelIssuedPrn as decideCancelIssuedPrn,
  acceptPrn as decideAcceptPrn,
  rejectPrn as decideRejectPrn,
  PRN_COMMAND_STATUS,
  PRN_COMMAND_REJECTION
} from '#waste-balances/domain/commands.js'

/**
 * @typedef {ReturnType<typeof import('#waste-balances/application/waste-balance-service.js').createWasteBalanceService>} WasteBalanceService
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PrnStatus} PrnStatus
 * @typedef {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} PackagingRecyclingNote
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
 * Maps a permitted status transition to the waste-balance decision it runs and
 * the operation label its system log carries. Transitions without an entry have
 * no balance effect. Keys must be transitions the state machine
 * (`PRN_STATUS_TRANSITIONS`) actually permits.
 *
 * @type {Record<string, { decide: (balance: import('#waste-balances/repository/ledger-schema.js').LedgerBalanceSnapshot, payload: import('#waste-balances/repository/ledger-schema.js').PrnPayload) => import('#waste-balances/domain/commands.js').PrnDecision, logOperation: string }>}
 */
const TRANSITION_TO_COMMAND = Object.freeze({
  [`${PRN_STATUS.DRAFT}|${PRN_STATUS.AWAITING_AUTHORISATION}`]: {
    decide: decideCreatePrn,
    logOperation: 'deduct_available'
  },
  [`${PRN_STATUS.AWAITING_AUTHORISATION}|${PRN_STATUS.AWAITING_ACCEPTANCE}`]: {
    decide: decideIssuePrn,
    logOperation: 'deduct_total'
  },
  [`${PRN_STATUS.AWAITING_ACCEPTANCE}|${PRN_STATUS.ACCEPTED}`]: {
    decide: decideAcceptPrn,
    logOperation: 'append_accepted'
  },
  [`${PRN_STATUS.AWAITING_ACCEPTANCE}|${PRN_STATUS.AWAITING_CANCELLATION}`]: {
    decide: decideRejectPrn,
    logOperation: 'append_rejected'
  },
  [`${PRN_STATUS.AWAITING_AUTHORISATION}|${PRN_STATUS.DELETED}`]: {
    decide: decideCancelPrnCreation,
    logOperation: 'credit_available'
  },
  [`${PRN_STATUS.AWAITING_CANCELLATION}|${PRN_STATUS.CANCELLED}`]: {
    decide: decideCancelIssuedPrn,
    logOperation: 'credit_full'
  },
  [`${PRN_STATUS.ACCEPTED}|${PRN_STATUS.CANCELLED}`]: {
    decide: decideCancelIssuedPrn,
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
 * Transitions onto a PRN already created and issued. Both are reachable only
 * from `awaiting_acceptance`, so both follow transitions that opened the
 * ledger: a missing ledger is not a client error but a broken invariant, and is
 * surfaced as a 500 rather than the contextual 400 the reachable commands
 * return. The target status alone identifies them, so this needs no second
 * table keyed the way `TRANSITION_TO_COMMAND` already is.
 *
 * @type {ReadonlySet<PrnStatus>}
 */
const TARGETS_REQUIRING_OPEN_LEDGER = Object.freeze(
  new Set([PRN_STATUS.ACCEPTED, PRN_STATUS.AWAITING_CANCELLATION])
)

/**
 * Apply a PRN status transition through the waste balance ledger: the ledger
 * folds, this decides, and the ledger appends what comes back.
 *
 * The decision runs inside the ledger command rather than ahead of it, and that
 * placement is the whole point. The PRN document is a projection that can lag
 * the stream, so the status the state machine rules on is read by projecting
 * the PRN — and projecting it *after* the fold means the ruling is made against
 * the head the events land on. Decide from a document read earlier and a
 * competing writer can slip in between: its append moves the head, this fold
 * sees the moved head, and the events land at the next free slot with every
 * guard satisfied and the transition made twice (PAE-1844). The slot index only
 * settles writers contending for the same slot; this settles the rest.
 *
 * The transition rule runs here once. There is no second check against the
 * document, because the document is not what the rule is about.
 *
 * @param {WasteBalanceService} service
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {Object} transition
 * @param {PackagingRecyclingNote} transition.prn - the fetched document, projected before the rule is applied
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId & { accreditationId: string }} transition.ledgerId
 * @param {PrnStatus} transition.newStatus
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnActor} transition.actor
 * @param {import('#domain/organisations/accreditation.js').Accreditation} [transition.accreditation] - fetched by the caller on the issuance path, ruled on here
 * @param {number} transition.tonnage
 * @param {import('#waste-balances/repository/ledger-schema.js').LedgerUserSummary} transition.createdBy
 * @param {Date} transition.now
 * @param {number} [transition.obligationYear]
 * @returns {Promise<{ events: Array<import('#waste-balances/repository/ledger-port.js').LedgerEvent>, projection: PackagingRecyclingNote, fromStatus: PrnStatus }>}
 */
export async function applyPrnTransition(
  service,
  logger,
  {
    prn,
    ledgerId,
    newStatus,
    actor,
    accreditation,
    tonnage,
    createdBy,
    now,
    obligationYear
  }
) {
  const payload = {
    prnId: prn.id,
    amount: tonnage,
    ...(obligationYear === undefined ? {} : { obligationYear })
  }

  /**
   * What the ruling settled, kept for the caller and the audit line. The
   * decision below assigns it before it can return at all, so it is present on
   * every path the command comes back from.
   *
   * @type {{ projection: PackagingRecyclingNote, fromStatus: PrnStatus, logOperation: string } | undefined}
   */
  let ruled

  const result = await service.runPrnCommand(
    ledgerId,
    payload,
    createdBy,
    async (balance) => {
      const projection = await projectPrnFromStreamTail(prn, service)
      const fromStatus = projection.status.currentStatus

      validateTransition(fromStatus, newStatus, actor)
      assertCancellationAllowed(
        fromStatus,
        newStatus,
        prn.accreditation.accreditationYear,
        now
      )
      if (newStatus === PRN_STATUS.AWAITING_ACCEPTANCE) {
        assertAccreditationCanIssue(accreditation)
      }

      const command = prnCommandFor(fromStatus, newStatus)
      ruled = { projection, fromStatus, logOperation: command.logOperation }

      // A ledger with no events cannot carry a PRN command. Whether that is the
      // client's fault is settled below, where the transition is known.
      if (!balance) {
        return {
          status: PRN_COMMAND_STATUS.REJECTED,
          reason: PRN_COMMAND_REJECTION.NO_LEDGER
        }
      }

      return command.decide(balance, payload)
    }
  )

  /* c8 ignore next 5 - defensive: the command only returns once the decision has run, and that records the ruling */
  if (!ruled) {
    throw Boom.badImplementation(
      `Waste balance command for PRN ${prn.id} returned without a recorded transition ruling`
    )
  }

  if (result.status === PRN_COMMAND_STATUS.REJECTED) {
    if (
      result.reason === PRN_COMMAND_REJECTION.NO_LEDGER &&
      TARGETS_REQUIRING_OPEN_LEDGER.has(newStatus)
    ) {
      throw Boom.badImplementation(
        `${ruled.fromStatus} -> ${newStatus} reached a missing waste balance ledger for accreditation ${ledgerId.accreditationId}; a created and issued PRN must have an open ledger`
      )
    }
    throw REJECTION_TO_ERROR[result.reason](ledgerId.accreditationId)
  }

  logWasteBalanceUpdate(
    logger,
    ruled.logOperation,
    prn.id,
    tonnage,
    ruled.fromStatus,
    newStatus
  )

  return {
    events: result.events,
    projection: ruled.projection,
    fromStatus: ruled.fromStatus
  }
}

import Boom from '@hapi/boom'

import {
  PRN_STATUS,
  validateTransition,
  assertAccreditationCanIssue
} from '#packaging-recycling-notes/domain/model.js'
import { assertCancellationAllowed } from '#packaging-recycling-notes/domain/cancellation.js'
import { projectPrnFromCatchupEvents } from './get-projected-prn.js'
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
 * return.
 *
 * @type {ReadonlySet<PrnStatus>}
 */
const TARGETS_REQUIRING_OPEN_LEDGER = Object.freeze(
  new Set([PRN_STATUS.ACCEPTED, PRN_STATUS.AWAITING_CANCELLATION])
)

/**
 * The decision a ledger command runs for a PRN status transition: rule on the
 * transition, then choose the balance command it carries.
 *
 * The status ruled on comes from projecting the PRN, because the document can
 * lag the stream. This runs inside the ledger command, so the projection is
 * read after the fold and the ruling holds at the head the events land on — see
 * `runPrnCommand` for why that ordering is what makes the write safe.
 *
 * @param {Object} transition
 * @param {WasteBalanceService} transition.service
 * @param {PackagingRecyclingNote} transition.prn
 * @param {PrnStatus} transition.newStatus
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnActor} transition.actor
 * @param {import('#domain/organisations/accreditation.js').Accreditation} [transition.accreditation]
 * @param {Date} transition.now
 * @param {import('#waste-balances/repository/ledger-schema.js').PrnPayload} transition.payload
 */
const ruleTransitionAndDecide =
  ({ service, prn, newStatus, actor, accreditation, now, payload }) =>
  async (
    /** @type {import('#waste-balances/repository/ledger-schema.js').LedgerBalanceSnapshot | null} */ balance
  ) => {
    const projection = await projectPrnFromCatchupEvents(prn, service)
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
    /* c8 ignore next 5 - defensive: the caller routes balance-affecting transitions here, so every transition reaching this point has a command */
    if (!command) {
      throw Boom.badImplementation(
        `${fromStatus} -> ${newStatus} took the waste balance write path but has no balance effect`
      )
    }

    // What the ruling settled, returned alongside the decision so the caller
    // and the audit line get it without reading the PRN again.
    const context = {
      projection,
      fromStatus,
      logOperation: command.logOperation
    }

    // A ledger with no events cannot carry a PRN command. Whether that is the
    // client's fault is settled by the caller, where the transition is known.
    if (!balance) {
      return {
        decision: {
          status: PRN_COMMAND_STATUS.REJECTED,
          reason: PRN_COMMAND_REJECTION.NO_LEDGER
        },
        context
      }
    }

    return { decision: command.decide(balance, payload), context }
  }

/**
 * Apply a PRN status transition through the waste balance ledger: the ledger
 * folds, `ruleTransitionAndDecide` rules and decides, and the ledger appends
 * what comes back. What the ruling settled returns with it, for the refusal
 * this raises and for the audit line.
 *
 * @param {WasteBalanceService} service
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {Object} transition
 * @param {PackagingRecyclingNote} transition.prn - the fetched document, projected before the rule is applied
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId & { accreditationId: string }} transition.ledgerId
 * @param {PrnStatus} transition.newStatus
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnActor} transition.actor
 * @param {import('#domain/organisations/accreditation.js').Accreditation} [transition.accreditation] - fetched by the caller on the issuance path, so a missing accreditation is reported before the transition is ruled on
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

  const { result, context: ruled } = await service.runPrnCommand(
    ledgerId,
    payload,
    createdBy,
    ruleTransitionAndDecide({
      service,
      prn,
      newStatus,
      actor,
      accreditation,
      now,
      payload
    })
  )

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

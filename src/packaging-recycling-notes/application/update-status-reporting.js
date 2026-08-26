/**
 * How a PRN status write reports itself once the domain has ruled: the system
 * log line naming what was appended, and the HTTP-shaped error carrying what
 * was refused. No balance effect is decided here — that is the domain's.
 */

import Boom from '@hapi/boom'

import {
  LEDGER_MISSING_AFTER_ISSUE,
  PrnLedgerRejectionError
} from '#packaging-recycling-notes/domain/prn-transition.js'
import { PRN_COMMAND_REJECTION } from '#waste-balances/domain/commands.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'

/**
 * Operational system log capturing that a waste balance write committed: one
 * line per event appended, labelled by what the event was.
 *
 * @param {import('#common/hapi-types.js').TypedLogger} logger
 * @param {Object} committed
 * @param {Array<{ kind: string }>} committed.events
 * @param {{ id: string, tonnage: number }} committed.prn
 * @param {string} committed.fromStatus
 * @param {string} committed.newStatus
 */
export function logWasteBalanceUpdate(
  logger,
  { events, prn, fromStatus, newStatus }
) {
  for (const { kind } of events) {
    logger.info({
      message: `Waste balance ${LOG_OPERATION_BY_EVENT_KIND[kind]} for PRN ${prn.id} (${fromStatus} -> ${newStatus}), tonnage ${prn.tonnage}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.DB,
        action: LOGGING_EVENT_ACTIONS.WASTE_BALANCE_UPDATED,
        reference: prn.id
      }
    })
  }
}

/**
 * The operation label the system log carries for each kind of committed event.
 * Keyed on what was appended rather than on the transition, so the log records
 * what happened rather than what a table predicted.
 *
 * @type {Record<string, string>}
 */
export const LOG_OPERATION_BY_EVENT_KIND = Object.freeze({
  [LEDGER_EVENT_KIND.PRN_CREATED]: 'deduct_available',
  [LEDGER_EVENT_KIND.PRN_ISSUED]: 'deduct_total',
  [LEDGER_EVENT_KIND.PRN_ACCEPTED]: 'append_accepted',
  [LEDGER_EVENT_KIND.PRN_REJECTED]: 'append_rejected',
  [LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED]: 'credit_available',
  [LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE]: 'credit_full'
})

/**
 * Turn a ledger rejection into the error its callers expect. The domain reports
 * the rejection as data; the contextual HTTP-shaped error is built here, where
 * the ledger identity is in hand.
 *
 * @type {Record<import('#packaging-recycling-notes/domain/prn-transition.js').PrnLedgerRejection, (accreditationId: string, refusal: PrnLedgerRejectionError) => Error>}
 */
const REJECTION_TO_ERROR = Object.freeze({
  [PRN_COMMAND_REJECTION.NO_LEDGER]: (accreditationId) =>
    Boom.badRequest(
      `No waste balance found for accreditation: ${accreditationId}`
    ),
  [PRN_COMMAND_REJECTION.INSUFFICIENT_AVAILABLE_BALANCE]: () =>
    Boom.conflict('Insufficient available waste balance'),
  [PRN_COMMAND_REJECTION.INSUFFICIENT_TOTAL_BALANCE]: () =>
    Boom.conflict('Insufficient total waste balance'),
  [LEDGER_MISSING_AFTER_ISSUE]: (accreditationId, { fromStatus, newStatus }) =>
    Boom.badImplementation(
      `${fromStatus} -> ${newStatus} reached a missing waste balance ledger for accreditation ${accreditationId}; a created and issued PRN must have an open ledger`
    )
})

/**
 * The error a refused transition surfaces as. A ledger rejection is shaped here
 * into the response its callers expect; the transition rules' own errors are
 * the classes the routes already map, and pass through untouched.
 *
 * @param {Error} error - the error the domain returned
 * @param {string} accreditationId
 * @returns {Error}
 */
export const toTransitionError = (error, accreditationId) =>
  error instanceof PrnLedgerRejectionError
    ? REJECTION_TO_ERROR[error.reason](accreditationId, error)
    : error

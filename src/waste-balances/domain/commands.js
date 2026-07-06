import { LEDGER_EVENT_KIND, ZERO_BALANCE } from '../repository/ledger-schema.js'
import {
  closingForSummaryLogSubmitted,
  closingForPrn
} from './ledger-closing-balance.js'

/**
 * The ledger state a command decides against: the resolved balance and the
 * running summary-log credit total — the whole ledger reduced to what a command
 * needs, with identity and head left off. `null` when the ledger has no events
 * yet.
 *
 * @typedef {Object} LedgerState
 * @property {import('../repository/ledger-schema.js').LedgerBalanceSnapshot} balance
 * @property {number} creditTotal - The latest summary-log credit total, the base
 *   the next submission's delta is measured against.
 */

/**
 * The balance-affecting outcome a command decides: the content of an event to
 * commit, without identity, position, or provenance. The caller stamps those and
 * appends it to the ledger.
 *
 * @typedef {Object} BalanceEvent
 * @property {import('../repository/ledger-schema.js').LedgerEventKind} kind
 * @property {import('../repository/ledger-schema.js').SummaryLogSubmittedPayload | import('../repository/ledger-schema.js').PrnPayload} payload
 * @property {import('../repository/ledger-schema.js').LedgerBalanceSnapshot} openingBalance
 * @property {import('../repository/ledger-schema.js').LedgerBalanceSnapshot} closingBalance
 */

/**
 * A PRN command's outcome as data, not control flow: either the balance events
 * to commit, or a reason the command cannot proceed. The deciders never throw —
 * the application layer turns a rejection into the contextual error its callers
 * expect (`reason` plus the ledger identity it holds).
 *
 * @typedef {{ status: 'committed', events: BalanceEvent[] }
 *   | { status: 'rejected', reason: PrnCommandRejection }} PrnDecision
 */

/**
 * @typedef {typeof PRN_COMMAND_REJECTION[keyof typeof PRN_COMMAND_REJECTION]} PrnCommandRejection
 */

export const PRN_COMMAND_STATUS = Object.freeze({
  COMMITTED: 'committed',
  REJECTED: 'rejected'
})

/**
 * Why a PRN command did not commit. `NO_LEDGER` is raised by the service shell
 * when the partition has no events to decide against; the sufficiency reasons
 * are raised by the deciders below.
 */
export const PRN_COMMAND_REJECTION = Object.freeze({
  NO_LEDGER: 'no-ledger',
  INSUFFICIENT_AVAILABLE_BALANCE: 'insufficient-available-balance',
  INSUFFICIENT_TOTAL_BALANCE: 'insufficient-total-balance'
})

/**
 * The state a summary-log submission opens a ledger from when none exists.
 * @type {LedgerState}
 */
const EMPTY_STATE = { balance: ZERO_BALANCE, creditTotal: 0 }

/**
 * Record a summary-log submission. An empty ledger is permissible — the first
 * submission opens it. The closing balance moves by the delta of this
 * submission's credit total against the ledger's running total.
 *
 * @param {LedgerState | null} state
 * @param {import('../repository/ledger-schema.js').SummaryLogSubmittedPayload} submission
 * @returns {BalanceEvent[]}
 */
export const submitSummaryLog = (state, { summaryLogId, creditTotal }) => {
  const { balance, creditTotal: previousCreditTotal } = state ?? EMPTY_STATE
  return [
    {
      kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
      payload: { summaryLogId, creditTotal },
      openingBalance: balance,
      closingBalance: closingForSummaryLogSubmitted(
        balance,
        creditTotal,
        previousCreditTotal
      )
    }
  ]
}

/**
 * @param {import('../repository/ledger-schema.js').LedgerEventKind} kind
 * @param {import('../repository/ledger-schema.js').LedgerBalanceSnapshot} opening
 * @param {import('../repository/ledger-schema.js').PrnPayload} payload
 * @returns {PrnDecision}
 */
const committed = (kind, opening, payload) => ({
  status: PRN_COMMAND_STATUS.COMMITTED,
  events: [
    {
      kind,
      payload,
      openingBalance: opening,
      closingBalance: closingForPrn(opening, kind, payload.amount)
    }
  ]
})

/**
 * @param {PrnCommandRejection} reason
 * @returns {PrnDecision}
 */
const rejected = (reason) => ({
  status: PRN_COMMAND_STATUS.REJECTED,
  reason
})

/**
 * Ringfence available balance for a new PRN. Rejects when the tonnage exceeds
 * the balance available to ringfence.
 *
 * @param {import('../repository/ledger-schema.js').LedgerBalanceSnapshot} balance
 * @param {import('../repository/ledger-schema.js').PrnPayload} payload
 * @returns {PrnDecision}
 */
export const createPrn = (balance, payload) =>
  balance.availableAmount < payload.amount
    ? rejected(PRN_COMMAND_REJECTION.INSUFFICIENT_AVAILABLE_BALANCE)
    : committed(LEDGER_EVENT_KIND.PRN_CREATED, balance, payload)

/**
 * Deduct total balance as a PRN is issued. Rejects when the tonnage exceeds the
 * total balance.
 *
 * @param {import('../repository/ledger-schema.js').LedgerBalanceSnapshot} balance
 * @param {import('../repository/ledger-schema.js').PrnPayload} payload
 * @returns {PrnDecision}
 */
export const issuePrn = (balance, payload) =>
  balance.amount < payload.amount
    ? rejected(PRN_COMMAND_REJECTION.INSUFFICIENT_TOTAL_BALANCE)
    : committed(LEDGER_EVENT_KIND.PRN_ISSUED, balance, payload)

/**
 * Credit the ringfenced available balance back when a pending PRN is deleted.
 *
 * @param {import('../repository/ledger-schema.js').LedgerBalanceSnapshot} balance
 * @param {import('../repository/ledger-schema.js').PrnPayload} payload
 * @returns {PrnDecision}
 */
export const cancelPrnCreation = (balance, payload) =>
  committed(LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED, balance, payload)

/**
 * Credit both balances back when an issued PRN's cancellation completes.
 *
 * @param {import('../repository/ledger-schema.js').LedgerBalanceSnapshot} balance
 * @param {import('../repository/ledger-schema.js').PrnPayload} payload
 * @returns {PrnDecision}
 */
export const cancelIssuedPrn = (balance, payload) =>
  committed(LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE, balance, payload)

/**
 * Record a PRN acceptance. No balance movement.
 *
 * @param {import('../repository/ledger-schema.js').LedgerBalanceSnapshot} balance
 * @param {import('../repository/ledger-schema.js').PrnPayload} payload
 * @returns {PrnDecision}
 */
export const acceptPrn = (balance, payload) =>
  committed(LEDGER_EVENT_KIND.PRN_ACCEPTED, balance, payload)

/**
 * Record a PRN rejection (cancellation request). No balance movement.
 *
 * @param {import('../repository/ledger-schema.js').LedgerBalanceSnapshot} balance
 * @param {import('../repository/ledger-schema.js').PrnPayload} payload
 * @returns {PrnDecision}
 */
export const rejectPrn = (balance, payload) =>
  committed(LEDGER_EVENT_KIND.PRN_REJECTED, balance, payload)

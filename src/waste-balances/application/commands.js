import Boom from '@hapi/boom'

import { STREAM_EVENT_KIND, ZERO_BALANCE } from '../repository/stream-schema.js'
import {
  closingForSummaryLogSubmitted,
  closingForPrn
} from './stream-closing-balance.js'

/**
 * The ledger state a command decides against: the resolved balance and the
 * running summary-log credit total. It is the fold of the whole ledger with the
 * identity and head left off — a command needs neither. `null` when the ledger
 * has no events yet.
 *
 * @typedef {Object} LedgerState
 * @property {import('../repository/stream-schema.js').StreamBalanceSnapshot} balance
 * @property {number} creditTotal - The latest summary-log credit total, the base
 *   the next submission's delta is measured against.
 */

/**
 * The balance-affecting outcome a command decides: the content of an event to
 * commit, without identity, position, or provenance. The caller stamps those and
 * appends it to the ledger.
 *
 * @typedef {Object} BalanceEvent
 * @property {import('../repository/stream-schema.js').StreamEventKind} kind
 * @property {import('../repository/stream-schema.js').SummaryLogSubmittedPayload | import('../repository/stream-schema.js').PrnPayload} payload
 * @property {import('../repository/stream-schema.js').StreamBalanceSnapshot} openingBalance
 * @property {import('../repository/stream-schema.js').StreamBalanceSnapshot} closingBalance
 */

/**
 * The state a summary-log submission opens a ledger from when none exists.
 * @type {LedgerState}
 */
const EMPTY_STATE = { balance: ZERO_BALANCE, creditTotal: 0 }

/**
 * Every PRN command acts on an existing PRN, so it requires a ledger to act
 * against. A PRN command on an empty ledger is incoherent — there is no balance
 * to ringfence, finalise, or reverse.
 *
 * @param {LedgerState | null} state
 * @returns {LedgerState}
 */
const requireState = (state) => {
  if (!state) {
    throw Boom.conflict(
      'No waste balance ledger exists for this registration or accreditation'
    )
  }
  return state
}

/**
 * The balance event for a PRN command of the given kind. The balance moves per
 * `closingForPrn`; status-only kinds leave it unchanged.
 *
 * @param {import('../repository/stream-schema.js').StreamBalanceSnapshot} balance
 * @param {import('../repository/stream-schema.js').StreamEventKind} kind
 * @param {string} prnId
 * @param {number} amount
 * @returns {BalanceEvent}
 */
const prnBalanceEvent = (balance, kind, prnId, amount) => ({
  kind,
  payload: { prnId, amount },
  openingBalance: balance,
  closingBalance: closingForPrn(balance, kind, amount)
})

/**
 * Record a summary-log submission. An empty ledger is permissible — the first
 * submission opens it. The closing balance moves by the delta of this
 * submission's credit total against the ledger's running total.
 *
 * @param {LedgerState | null} state
 * @param {import('../repository/stream-schema.js').SummaryLogSubmittedPayload} submission
 * @returns {BalanceEvent[]}
 */
export const submitSummaryLog = (state, { summaryLogId, creditTotal }) => {
  const { balance, creditTotal: previousCreditTotal } = state ?? EMPTY_STATE
  return [
    {
      kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
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
 * Create a PRN, ringfencing its tonnage out of the available balance. Refuses
 * when the available balance cannot cover it.
 *
 * @param {LedgerState | null} state
 * @param {import('../repository/stream-schema.js').PrnPayload} prn
 * @returns {BalanceEvent[]}
 */
export const createPrn = (state, { prnId, amount }) => {
  const { balance } = requireState(state)
  if (balance.availableAmount < amount) {
    throw Boom.conflict('Insufficient available waste balance')
  }
  return [
    prnBalanceEvent(balance, STREAM_EVENT_KIND.PRN_CREATED, prnId, amount)
  ]
}

/**
 * Issue a PRN, finalising the deduction against the total balance. Refuses when
 * the total balance cannot cover it.
 *
 * @param {LedgerState | null} state
 * @param {import('../repository/stream-schema.js').PrnPayload} prn
 * @returns {BalanceEvent[]}
 */
export const issuePrn = (state, { prnId, amount }) => {
  const { balance } = requireState(state)
  if (balance.amount < amount) {
    throw Boom.conflict('Insufficient total waste balance')
  }
  return [prnBalanceEvent(balance, STREAM_EVENT_KIND.PRN_ISSUED, prnId, amount)]
}

/**
 * Cancel a PRN that was created but never issued, returning the ringfenced
 * tonnage to the available balance.
 *
 * @param {LedgerState | null} state
 * @param {import('../repository/stream-schema.js').PrnPayload} prn
 * @returns {BalanceEvent[]}
 */
export const cancelPrnCreation = (state, { prnId, amount }) => [
  prnBalanceEvent(
    requireState(state).balance,
    STREAM_EVENT_KIND.PRN_CREATION_CANCELLED,
    prnId,
    amount
  )
]

/**
 * Cancel an issued PRN, returning its tonnage to both the total and available
 * balance.
 *
 * @param {LedgerState | null} state
 * @param {import('../repository/stream-schema.js').PrnPayload} prn
 * @returns {BalanceEvent[]}
 */
export const cancelIssuedPrn = (state, { prnId, amount }) => [
  prnBalanceEvent(
    requireState(state).balance,
    STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
    prnId,
    amount
  )
]

/**
 * Record acceptance of an issued PRN. No balance movement.
 *
 * @param {LedgerState | null} state
 * @param {import('../repository/stream-schema.js').PrnPayload} prn
 * @returns {BalanceEvent[]}
 */
export const acceptPrn = (state, { prnId, amount }) => [
  prnBalanceEvent(
    requireState(state).balance,
    STREAM_EVENT_KIND.PRN_ACCEPTED,
    prnId,
    amount
  )
]

/**
 * Record rejection of an issued PRN. No balance movement.
 *
 * @param {LedgerState | null} state
 * @param {import('../repository/stream-schema.js').PrnPayload} prn
 * @returns {BalanceEvent[]}
 */
export const rejectPrn = (state, { prnId, amount }) => [
  prnBalanceEvent(
    requireState(state).balance,
    STREAM_EVENT_KIND.PRN_REJECTED,
    prnId,
    amount
  )
]

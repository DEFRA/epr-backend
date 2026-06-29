import { STREAM_EVENT_KIND, ZERO_BALANCE } from '../repository/stream-schema.js'
import { closingForSummaryLogSubmitted } from './stream-closing-balance.js'

/**
 * The ledger state a command decides against: the resolved balance and the
 * running summary-log credit total — the whole ledger reduced to what a command
 * needs, with identity and head left off. `null` when the ledger has no events
 * yet.
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
 * @property {import('../repository/stream-schema.js').SummaryLogSubmittedPayload} payload
 * @property {import('../repository/stream-schema.js').StreamBalanceSnapshot} openingBalance
 * @property {import('../repository/stream-schema.js').StreamBalanceSnapshot} closingBalance
 */

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

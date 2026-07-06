import { add, subtract, toNumber } from '#common/helpers/decimal-utils.js'

import { LEDGER_EVENT_KIND } from '../repository/ledger-schema.js'

/**
 * Compute closing balance for a summary-log-submitted event.
 *
 * The caller supplies the aggregate `creditTotal` for this submission.
 * `delta = creditTotal - previousCreditTotal`. Both `amount` and
 * `availableAmount` shift by delta.
 *
 * @param {import('../repository/ledger-schema.js').LedgerBalanceSnapshot} opening
 * @param {number} creditTotal
 * @param {number} previousCreditTotal
 * @returns {import('../repository/ledger-schema.js').LedgerBalanceSnapshot}
 */
export const closingForSummaryLogSubmitted = (
  opening,
  creditTotal,
  previousCreditTotal
) => {
  const delta = subtract(creditTotal, previousCreditTotal)
  return {
    amount: toNumber(add(opening.amount, delta)),
    availableAmount: toNumber(add(opening.availableAmount, delta))
  }
}

/**
 * Compute closing balance for a PRN event.
 *
 * @param {import('../repository/ledger-schema.js').LedgerBalanceSnapshot} opening
 * @param {import('../repository/ledger-schema.js').LedgerEventKind} kind
 * @param {number} prnAmount
 * @returns {import('../repository/ledger-schema.js').LedgerBalanceSnapshot}
 */
export const closingForPrn = (opening, kind, prnAmount) => {
  switch (kind) {
    case LEDGER_EVENT_KIND.PRN_CREATED:
      return {
        amount: opening.amount,
        availableAmount: toNumber(subtract(opening.availableAmount, prnAmount))
      }
    case LEDGER_EVENT_KIND.PRN_ISSUED:
      return {
        amount: toNumber(subtract(opening.amount, prnAmount)),
        availableAmount: opening.availableAmount
      }
    case LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED:
      return {
        amount: opening.amount,
        availableAmount: toNumber(add(opening.availableAmount, prnAmount))
      }
    case LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE:
      return {
        amount: toNumber(add(opening.amount, prnAmount)),
        availableAmount: toNumber(add(opening.availableAmount, prnAmount))
      }
    case LEDGER_EVENT_KIND.PRN_ACCEPTED:
    case LEDGER_EVENT_KIND.PRN_REJECTED:
      return { ...opening }
    default:
      throw new Error(`Unknown PRN event kind: ${kind}`)
  }
}

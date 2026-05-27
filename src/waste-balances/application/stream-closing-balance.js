import { add, subtract, toNumber } from '#common/helpers/decimal-utils.js'

import { STREAM_EVENT_KIND } from '../repository/stream-schema.js'

/**
 * Compute closing balance for a summary-log-submitted event.
 *
 * The caller supplies the aggregate `creditTotal` for this submission.
 * `delta = creditTotal - previousCreditTotal`. Both `amount` and
 * `availableAmount` shift by delta.
 *
 * @param {import('../repository/stream-schema.js').StreamBalanceSnapshot} opening
 * @param {number} creditTotal
 * @param {number} previousCreditTotal
 * @returns {import('../repository/stream-schema.js').StreamBalanceSnapshot}
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
 * @param {import('../repository/stream-schema.js').StreamBalanceSnapshot} opening
 * @param {import('../repository/stream-schema.js').StreamEventKind} kind
 * @param {number} prnAmount
 * @returns {import('../repository/stream-schema.js').StreamBalanceSnapshot}
 */
export const closingForPrn = (opening, kind, prnAmount) => {
  switch (kind) {
    case STREAM_EVENT_KIND.PRN_CREATED:
      return {
        amount: opening.amount,
        availableAmount: toNumber(subtract(opening.availableAmount, prnAmount))
      }
    case STREAM_EVENT_KIND.PRN_ISSUED:
      return {
        amount: toNumber(subtract(opening.amount, prnAmount)),
        availableAmount: opening.availableAmount
      }
    case STREAM_EVENT_KIND.PRN_CREATION_CANCELLED:
      return {
        amount: opening.amount,
        availableAmount: toNumber(add(opening.availableAmount, prnAmount))
      }
    case STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE:
      return {
        amount: toNumber(add(opening.amount, prnAmount)),
        availableAmount: toNumber(add(opening.availableAmount, prnAmount))
      }
    default:
      throw new Error(`Unknown PRN event kind: ${kind}`)
  }
}

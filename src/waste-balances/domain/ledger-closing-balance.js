import { add, subtract, toNumber } from '#common/helpers/decimal-utils.js'

import { LEDGER_EVENT_KIND } from '../repository/ledger-schema.js'

/**
 * Compute closing balance for a summary-log-submitted event.
 *
 * The caller supplies the aggregate `creditTotal` for this submission.
 * `delta = creditTotal - previousCreditTotal`. Both `amount` and
 * `availableAmount` shift by delta.
 *
 * The December portion moves by its own `decemberCreditTotal` delta in the same
 * way (PAE-1920): a resubmission moving tonnage into or out of December
 * self-corrects because the delta is measured against the previous submission's
 * December total. With no ringfencing yet (PAE-1922),
 * `decemberAvailableAmount` tracks `decemberAmount`.
 *
 * @param {import('../repository/ledger-schema.js').LedgerBalanceSnapshot} opening
 * @param {number} creditTotal
 * @param {number} previousCreditTotal
 * @param {number} [decemberCreditTotal]
 * @param {number} [previousDecemberCreditTotal]
 * @returns {import('../repository/ledger-schema.js').LedgerBalanceSnapshot}
 */
export const closingForSummaryLogSubmitted = (
  opening,
  creditTotal,
  previousCreditTotal,
  decemberCreditTotal = 0,
  previousDecemberCreditTotal = 0
) => {
  const delta = subtract(creditTotal, previousCreditTotal)
  const decemberDelta = subtract(
    decemberCreditTotal,
    previousDecemberCreditTotal
  )
  return {
    amount: toNumber(add(opening.amount, delta)),
    availableAmount: toNumber(add(opening.availableAmount, delta)),
    decemberAmount: toNumber(add(opening.decemberAmount ?? 0, decemberDelta)),
    decemberAvailableAmount: toNumber(
      add(opening.decemberAvailableAmount ?? 0, decemberDelta)
    )
  }
}

/**
 * Compute closing balance for a PRN event.
 *
 * The December portion is carried through unchanged (PAE-1920): December
 * spending is out of scope (PAE-1922), but the latest event's closing balance
 * must still surface December, so every PRN event preserves the opening
 * December amounts by spreading `opening`.
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
        ...opening,
        availableAmount: toNumber(subtract(opening.availableAmount, prnAmount))
      }
    case LEDGER_EVENT_KIND.PRN_ISSUED:
      return {
        ...opening,
        amount: toNumber(subtract(opening.amount, prnAmount))
      }
    case LEDGER_EVENT_KIND.PRN_CREATION_CANCELLED:
      return {
        ...opening,
        availableAmount: toNumber(add(opening.availableAmount, prnAmount))
      }
    case LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE:
      return {
        ...opening,
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

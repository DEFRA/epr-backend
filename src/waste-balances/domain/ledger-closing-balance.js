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
 * way: a resubmission moving tonnage into or out of December self-corrects
 * because the delta is measured against the previous submission's December
 * total. `decemberAmount` and `decemberAvailableAmount` move together by that
 * delta.
 *
 * A December portion is only materialised once one exists: when the opening
 * already carries December, or when this submission moves it (a non-zero
 * delta). A submission that neither opens with December nor moves it (an output
 * accreditation, or a balance before its first December load) leaves the
 * closing balance with no December fields at all.
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
  const closing = {
    amount: toNumber(add(opening.amount, delta)),
    availableAmount: toNumber(add(opening.availableAmount, delta))
  }

  const decemberDelta = toNumber(
    subtract(decemberCreditTotal, previousDecemberCreditTotal)
  )
  if (opening.decemberAmount === undefined && decemberDelta === 0) {
    return closing
  }

  return {
    ...closing,
    decemberAmount: toNumber(add(opening.decemberAmount ?? 0, decemberDelta)),
    decemberAvailableAmount: toNumber(
      add(opening.decemberAvailableAmount ?? 0, decemberDelta)
    )
  }
}

/**
 * Compute closing balance for a PRN event.
 *
 * A PRN event moves the total fields but leaves the December amounts as they
 * opened, so the latest event's closing balance still surfaces the December
 * portion. Every case spreads `opening` to carry those amounts through.
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

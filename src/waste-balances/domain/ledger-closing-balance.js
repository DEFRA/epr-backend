import { add, subtract, toNumber } from '#common/helpers/decimal-utils.js'

import { LEDGER_EVENT_KIND, POOL } from '../repository/ledger-schema.js'

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
 * A December portion is materialised only once one exists: when the opening
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
 * Debit a December pool field by `prnAmount`. The decider only routes to the
 * December pool once the opening carries a December portion (its sufficiency
 * check reads the same field), so reaching here with the field absent is a
 * broken invariant, not a state to coalesce away. Fail loud rather than
 * silently materialise a negative December pool.
 *
 * @param {number | undefined} openingPortion
 * @param {number} prnAmount
 * @param {string} field
 * @returns {number}
 */
const debitDecemberPortion = (openingPortion, prnAmount, field) => {
  if (openingPortion === undefined) {
    throw new Error(
      `Cannot debit the December pool: opening balance carries no ${field}`
    )
  }
  return toNumber(subtract(openingPortion, prnAmount))
}

/**
 * Compute closing balance for a PRN event.
 *
 * A general PRN moves the total fields but leaves the December amounts as they
 * opened, so the latest event's closing balance still surfaces the December
 * portion. Every case spreads `opening` to carry those amounts through.
 *
 * A December PRN (`pool === 'december'`) moves its pool by the same delta it
 * applies to the total: creation ringfences `decemberAvailableAmount` alongside
 * `availableAmount`, issue deducts `decemberAmount` alongside `amount`.
 *
 * @param {import('../repository/ledger-schema.js').LedgerBalanceSnapshot} opening
 * @param {import('../repository/ledger-schema.js').LedgerEventKind} kind
 * @param {number} prnAmount
 * @param {import('../repository/ledger-schema.js').Pool} [pool]
 * @returns {import('../repository/ledger-schema.js').LedgerBalanceSnapshot}
 */
export const closingForPrn = (
  opening,
  kind,
  prnAmount,
  pool = POOL.GENERAL
) => {
  const drawsDecember = pool === POOL.DECEMBER
  switch (kind) {
    case LEDGER_EVENT_KIND.PRN_CREATED:
      return {
        ...opening,
        availableAmount: toNumber(subtract(opening.availableAmount, prnAmount)),
        ...(drawsDecember && {
          decemberAvailableAmount: debitDecemberPortion(
            opening.decemberAvailableAmount,
            prnAmount,
            'decemberAvailableAmount'
          )
        })
      }
    case LEDGER_EVENT_KIND.PRN_ISSUED:
      return {
        ...opening,
        amount: toNumber(subtract(opening.amount, prnAmount)),
        ...(drawsDecember && {
          decemberAmount: debitDecemberPortion(
            opening.decemberAmount,
            prnAmount,
            'decemberAmount'
          )
        })
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

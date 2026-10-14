import { availableForPool } from '#waste-balances/domain/pool-balances.js'
import { POOL } from '#waste-balances/repository/ledger-schema.js'

/** @import { LedgerBalanceSnapshot } from '#waste-balances/repository/ledger-schema.js' */

/**
 * @typedef {{
 *   amount: number,
 *   availableAmount: number,
 *   decemberAmount?: number,
 *   decemberAvailableAmount?: number,
 *   nonDecemberAvailableAmount?: number
 * }} WasteBalanceBody
 */

/**
 * The separate December portion of a balance, plus the derived non-December
 * remainder of `availableAmount`, surfaced only when the accreditation holds
 * a December portion. A drained in-window pool still reports `0`s; an
 * accreditation with no December portion omits all three fields entirely -
 * its whole `availableAmount` already IS the only balance, so there is no
 * meaningful non-December split to report.
 *
 * @param {LedgerBalanceSnapshot | null} [balance]
 * @returns {{ decemberAmount?: number, decemberAvailableAmount?: number, nonDecemberAvailableAmount?: number }}
 */
const decemberFields = (balance) => ({
  ...(balance?.decemberAmount !== undefined && {
    decemberAmount: balance.decemberAmount
  }),
  ...(balance?.decemberAvailableAmount !== undefined && {
    decemberAvailableAmount: balance.decemberAvailableAmount,
    nonDecemberAvailableAmount: availableForPool(balance, POOL.GENERAL)
  })
})

/**
 * An accreditation's waste balance as served, zero when it has no ledger yet.
 *
 * @param {LedgerBalanceSnapshot | null} [balance]
 * @returns {WasteBalanceBody}
 */
export const toBalanceBody = (balance) => ({
  amount: balance?.amount ?? 0,
  availableAmount: balance?.availableAmount ?? 0,
  ...decemberFields(balance)
})

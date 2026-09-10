import { subtract, toNumber } from '#common/helpers/decimal-utils.js'

/**
 * The pool arithmetic a PRN raise is bounded by (ADR-0049), stated once so the
 * create route's point-in-time pre-check and the ringfence decider cannot
 * drift apart. Absent December fields coalesce to 0, so a general balance
 * behaves byte-for-byte as it did before December waste existed.
 *
 * @import { LedgerBalanceSnapshot } from '../repository/ledger-schema.js'
 */

/**
 * The available balance a creation draws on: the December pool when the PRN
 * uses it, else the derived non-December (`availableAmount -
 * decemberAvailableAmount`), which reserves December tonnage from a general
 * raise.
 *
 * @param {LedgerBalanceSnapshot} balance
 * @param {boolean} [useDecemberBalance]
 * @returns {number}
 */
export const availableForPool = (balance, useDecemberBalance) =>
  useDecemberBalance
    ? (balance.decemberAvailableAmount ?? 0)
    : toNumber(
        subtract(balance.availableAmount, balance.decemberAvailableAmount ?? 0)
      )

/**
 * The total balance an issue draws on: the December pool when the PRN uses it,
 * else the derived non-December (`amount - decemberAmount`).
 *
 * @param {LedgerBalanceSnapshot} balance
 * @param {boolean} [useDecemberBalance]
 * @returns {number}
 */
export const amountForPool = (balance, useDecemberBalance) =>
  useDecemberBalance
    ? (balance.decemberAmount ?? 0)
    : toNumber(subtract(balance.amount, balance.decemberAmount ?? 0))

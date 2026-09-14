import { subtract, toNumber } from '#common/helpers/decimal-utils.js'

import { POOL } from '../repository/ledger-schema.js'

/**
 * The pool arithmetic a PRN raise is bounded by (ADR-0049), stated once so the
 * create route's point-in-time pre-check and the ringfence decider cannot
 * drift apart. Absent December fields coalesce to 0, so a general balance
 * behaves byte-for-byte as it did before December waste existed.
 *
 * @import { LedgerBalanceSnapshot, Pool } from '../repository/ledger-schema.js'
 */

/**
 * The available balance a creation draws on: the December pool when the PRN
 * draws it, else the derived non-December (`availableAmount -
 * decemberAvailableAmount`), which reserves December tonnage from a general
 * raise.
 *
 * @param {LedgerBalanceSnapshot} balance
 * @param {Pool} [pool]
 * @returns {number}
 */
export const availableForPool = (balance, pool) =>
  pool === POOL.DECEMBER
    ? (balance.decemberAvailableAmount ?? 0)
    : toNumber(
        subtract(balance.availableAmount, balance.decemberAvailableAmount ?? 0)
      )

/**
 * The total balance an issue draws on: the December pool when the PRN draws it,
 * else the derived non-December (`amount - decemberAmount`).
 *
 * @param {LedgerBalanceSnapshot} balance
 * @param {Pool} [pool]
 * @returns {number}
 */
export const amountForPool = (balance, pool) =>
  pool === POOL.DECEMBER
    ? (balance.decemberAmount ?? 0)
    : toNumber(subtract(balance.amount, balance.decemberAmount ?? 0))

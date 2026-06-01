import { logger } from '#common/helpers/logging/logger.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '#waste-balances/domain/model.js'

const WASTE_BALANCES_COLLECTION = 'waste-balances'
const LOCK_NAME = 'canonical-source-census'

const CENSUS_PIPELINE = [
  { $group: { _id: '$canonicalSource', count: { $sum: 1 } } }
]

/**
 * @typedef {Object} CanonicalSourceCount
 * @property {string|null} _id
 * @property {number} count
 */

/**
 * @param {import('mongodb').Db} db
 * @returns {Promise<CanonicalSourceCount[]>}
 */
export const countWasteBalancesByCanonicalSource = async (db) => {
  const docs = await db
    .collection(WASTE_BALANCES_COLLECTION)
    .aggregate(CENSUS_PIPELINE)
    .toArray()
  return /** @type {CanonicalSourceCount[]} */ (/** @type {unknown} */ (docs))
}

/**
 * @param {CanonicalSourceCount[]} rows
 */
const formatCensusLine = (rows) => {
  const known = {
    [WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED]: 0,
    [WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING]: 0,
    [WASTE_BALANCE_CANONICAL_SOURCE.LEDGER]: 0
  }
  let unknown = 0

  for (const row of rows) {
    if (row._id !== null && Object.hasOwn(known, row._id)) {
      known[row._id] += row.count
    } else {
      unknown += row.count
    }
  }

  const embedded = known[WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED]
  const migrating = known[WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING]
  const ledger = known[WASTE_BALANCE_CANONICAL_SOURCE.LEDGER]
  const total = embedded + migrating + ledger + unknown

  return [
    'Waste balance canonicalSource census:',
    `embedded=${embedded}`,
    `migrating=${migrating}`,
    `ledger=${ledger}`,
    `unknown=${unknown}`,
    `total=${total}`
  ].join(' ')
}

const runCensus = async (server) => {
  const rows = await countWasteBalancesByCanonicalSource(server.db)
  logger.info({ message: formatCensusLine(rows) })
}

/**
 * One-shot startup diagnostic that logs a single line counting waste-balance
 * documents by `canonicalSource`. Unlike `runStreamPromotion` (which reports
 * only what it promoted this run) and the size/divergence diagnostics (which
 * filter to non-ledger docs), this emits the cumulative population split —
 * embedded / migrating / ledger — turning ledger-migration progress into a
 * plottable burn-down across deploys.
 *
 * Read-only, safe under live traffic. Runs under a cross-instance lock so a
 * single pod per deploy executes the scan. Info level only.
 *
 * @param {Object} server - Hapi server instance
 */
export const runCanonicalSourceCensus = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping canonical-source census'
      })
      return
    }
    try {
      await runCensus(server)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run canonical-source census'
    })
  }
}

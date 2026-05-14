import { logger } from '#common/helpers/logging/logger.js'
import { computePercentOfBsonLimit } from '#waste-balances/application/growth-observability.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '#waste-balances/domain/model.js'

const WASTE_BALANCES_COLLECTION = 'waste-balances'
const LOCK_NAME = 'balance-size-diagnostic'
const TOP_N = 10

/**
 * @typedef {Object} BalanceSizeRow
 * @property {string} organisationId
 * @property {string} accreditationId
 * @property {number} transactionCount
 * @property {number} bsonSize
 */

const TOP_BY_SIZE_PIPELINE = [
  {
    $match: { canonicalSource: { $ne: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER } }
  },
  {
    $project: {
      _id: 0,
      organisationId: 1,
      accreditationId: 1,
      transactionCount: { $size: { $ifNull: ['$transactions', []] } },
      bsonSize: { $bsonSize: '$$ROOT' }
    }
  },
  { $sort: { bsonSize: -1 } },
  { $limit: TOP_N }
]

/**
 * @param {import('mongodb').Db} db
 * @returns {Promise<BalanceSizeRow[]>}
 */
export const findTopWasteBalancesBySize = async (db) => {
  const docs = await db
    .collection(WASTE_BALANCES_COLLECTION)
    .aggregate(TOP_BY_SIZE_PIPELINE, { allowDiskUse: true })
    .toArray()
  return /** @type {BalanceSizeRow[]} */ (/** @type {unknown} */ (docs))
}

const formatSnapshotLine = (row) =>
  [
    'Waste balance document size snapshot:',
    `organisationId=${row.organisationId}`,
    `accreditationId=${row.accreditationId}`,
    `transactionCount=${row.transactionCount}`,
    `bsonSize=${row.bsonSize}`,
    `percentOfBsonLimit=${computePercentOfBsonLimit(row.bsonSize)}`
  ].join(' ')

const runDiagnostic = async (server) => {
  logger.info({
    message: `Running waste-balance size diagnostic (top ${TOP_N} by descending bsonSize)`
  })

  const rows = await findTopWasteBalancesBySize(server.db)

  if (rows.length === 0) {
    logger.info({
      message: 'Waste-balance size diagnostic: no embedded balances found'
    })
    return
  }

  for (const row of rows) {
    logger.info({ message: formatSnapshotLine(row) })
  }
}

/**
 * One-shot startup diagnostic that logs the top N embedded waste-balance
 * documents by descending BSON size. Mirrors the per-write growth log emitted
 * by `recordWasteBalanceGrowth`, so the same OpenSearch query surfaces both
 * the live append trail and the boot-time snapshot of the largest documents.
 *
 * Ledger-canonical accreditations are excluded — the ledger collection isn't
 * subject to per-document growth pressure.
 *
 * Read-only, safe under live traffic. Runs under a cross-instance lock so a
 * single pod per deploy executes the scan.
 *
 * @param {Object} server - Hapi server instance
 */
export const runBalanceSizeDiagnostic = async (server) => {
  try {
    const lock = await server.locker.lock(LOCK_NAME)
    if (!lock) {
      logger.info({
        message: 'Unable to obtain lock, skipping waste-balance size diagnostic'
      })
      return
    }
    try {
      await runDiagnostic(server)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error({
      err: error,
      message: 'Failed to run waste-balance size diagnostic'
    })
  }
}

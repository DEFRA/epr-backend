import { BSON } from 'mongodb'
import { logger } from '#common/helpers/logging/logger.js'

const BSON_DOCUMENT_MAX_SIZE_BYTES = 16 * 1024 * 1024

/**
 * Emit a structured log line capturing how close an embedded waste-balance
 * document is to the 16MB BSON limit. Every embedded write path (summary-log
 * row updates and the four PRN operations) routes through `saveBalance`, which
 * calls this helper so growth from all sources is visible.
 *
 * The ledger-append path doesn't go through `saveBalance` and is out of scope.
 *
 * `bsonSize` is the size of the in-memory `updatedBalance` rather than a query
 * of the persisted document; it is an approximation suitable for tracking the
 * trend toward the 16MB ceiling, not a precise on-disk measurement.
 *
 * Fields are encoded into the `message` string as space-separated `key=value`
 * pairs to match the typed CdpIndexedLog schema while keeping each field
 * searchable in OpenSearch.
 *
 * @param {import('../domain/model.js').WasteBalance} updatedBalance
 * @param {import('../domain/model.js').WasteBalanceTransaction[]} newTransactions
 */
export const recordWasteBalanceGrowth = (updatedBalance, newTransactions) => {
  const bsonSize = BSON.calculateObjectSize(updatedBalance)
  const percentOfBsonLimit =
    Math.round((bsonSize / BSON_DOCUMENT_MAX_SIZE_BYTES) * 10000) / 100
  const transactionCount = updatedBalance.transactions.length
  const newTransactionCount = newTransactions.length

  logger.info({
    message:
      `Waste balance document growth:` +
      ` accreditationId=${updatedBalance.accreditationId}` +
      ` canonicalSource=${updatedBalance.canonicalSource}` +
      ` transactionCount=${transactionCount}` +
      ` newTransactionCount=${newTransactionCount}` +
      ` bsonSize=${bsonSize}` +
      ` percentOfBsonLimit=${percentOfBsonLimit}`
  })
}

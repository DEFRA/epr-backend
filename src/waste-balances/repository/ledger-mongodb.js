/** @import { Collection, Db } from 'mongodb' */

export const WASTE_BALANCE_LEDGER_COLLECTION_NAME = 'waste-balance-transactions'

/**
 * Ensures the ledger collection exists with the indexes required by ADR 0031.
 *
 * Safe to call multiple times — MongoDB `createIndex` is idempotent for
 * matching specifications.
 *
 * @param {Db} db
 * @returns {Promise<Collection>}
 */
export async function ensureLedgerCollection(db) {
  const collection = db.collection(WASTE_BALANCE_LEDGER_COLLECTION_NAME)

  await collection.createIndex(
    { accreditationId: 1, number: 1 },
    { name: 'accreditationId_number', unique: true }
  )

  await collection.createIndex(
    { 'source.summaryLogRow.wasteRecordId': 1 },
    { name: 'summaryLogRow_wasteRecordId' }
  )

  // Compound index serves both "transactions for summary log S" queries
  // (via summaryLogId prefix) and "transactions a specific row caused"
  // queries (full-key lookup). A standalone summaryLogId index would be
  // strictly redundant here.
  await collection.createIndex(
    {
      'source.summaryLogRow.summaryLogId': 1,
      'source.summaryLogRow.rowId': 1,
      'source.summaryLogRow.rowType': 1
    },
    { name: 'summaryLogRow_row' }
  )

  await collection.createIndex(
    { 'source.prnOperation.prnId': 1 },
    { name: 'prnOperation_prnId' }
  )

  return collection
}

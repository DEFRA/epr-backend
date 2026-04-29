/** @import { Collection, Db } from 'mongodb' */

/**
 * @typedef {import('./ledger-schema.js').LedgerTransactionInsert} LedgerTransactionInsert
 */

/**
 * @typedef {import('./ledger-schema.js').LedgerTransaction} LedgerTransaction
 */

import {
  ledgerDocumentFromMongo,
  ledgerInsertToMongo
} from './ledger-decimal.js'
import { LedgerSlotConflictError } from './ledger-port.js'
import { LEDGER_SOURCE_KIND, LEDGER_TRANSACTION_TYPE } from './ledger-schema.js'
import {
  validateLedgerTransactionInsert,
  validateLedgerTransactionRead
} from './ledger-validation.js'
import { toNumber } from '#common/helpers/decimal-utils.js'

export const WASTE_BALANCE_LEDGER_COLLECTION_NAME = 'waste-balance-transactions'

const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000

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

const toLedgerTransaction = (doc) => {
  const { _id, ...rest } = doc
  return validateLedgerTransactionRead({
    id: _id.toString(),
    ...ledgerDocumentFromMongo(rest)
  })
}

/**
 * @param {unknown} candidate
 * @returns {candidate is { index: number, code: number }}
 */
const isDuplicateKeyWriteError = (candidate) =>
  typeof candidate === 'object' &&
  candidate !== null &&
  'code' in candidate &&
  candidate.code === MONGODB_DUPLICATE_KEY_ERROR_CODE &&
  'index' in candidate &&
  typeof candidate.index === 'number'

/**
 * @param {unknown} error
 * @returns {{ index: number, code: number } | undefined}
 */
const findDuplicateKeyWriteError = (error) => {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('writeErrors' in error) ||
    !Array.isArray(error.writeErrors)
  ) {
    return undefined
  }
  return error.writeErrors.find(isDuplicateKeyWriteError)
}

/**
 * @param {Collection} collection
 * @returns {(transactions: LedgerTransactionInsert[]) => Promise<LedgerTransaction[]>}
 */
const performInsertTransactions = (collection) => async (transactions) => {
  if (transactions.length === 0) {
    return []
  }

  const validated = transactions.map(validateLedgerTransactionInsert)
  const persistable = validated.map(ledgerInsertToMongo)

  try {
    const result = await collection.insertMany(persistable, { ordered: true })
    return persistable.map((transaction, index) =>
      toLedgerTransaction({ _id: result.insertedIds[index], ...transaction })
    )
  } catch (error) {
    const writeError = findDuplicateKeyWriteError(error)
    if (writeError) {
      const conflict = validated[writeError.index]
      throw new LedgerSlotConflictError(
        conflict.accreditationId,
        conflict.number
      )
    }
    throw error
  }
}

/**
 * @param {Collection} collection
 * @returns {(accreditationId: string) => Promise<LedgerTransaction | null>}
 */
const performFindLatestByAccreditationId =
  (collection) => async (accreditationId) => {
    const doc = await collection.findOne(
      { accreditationId },
      { sort: { number: -1 } }
    )

    return doc ? toLedgerTransaction(doc) : null
  }

/**
 * Resolve credited amounts in one round trip. The aggregation matches every
 * `summary-log-row` transaction whose `wasteRecordId` is in the input, signs
 * each amount by transaction type, and groups by `wasteRecordId`. Pending
 * debits do not participate — they are a ringfence against the running
 * balance, not a credit attributable to any specific waste record.
 *
 * @param {Collection} collection
 * @returns {(wasteRecordIds: string[]) => Promise<Map<string, number>>}
 */
const performFindCreditedAmountsByWasteRecordIds =
  (collection) => async (wasteRecordIds) => {
    const totals = new Map()
    for (const id of wasteRecordIds) {
      totals.set(id, 0)
    }

    if (totals.size === 0) {
      return totals
    }

    const requestedIds = Array.from(totals.keys())

    const aggregated = await collection
      .aggregate([
        {
          $match: {
            'source.kind': LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
            'source.summaryLogRow.wasteRecordId': { $in: requestedIds }
          }
        },
        {
          $group: {
            _id: '$source.summaryLogRow.wasteRecordId',
            total: {
              $sum: {
                $cond: [
                  { $eq: ['$type', LEDGER_TRANSACTION_TYPE.CREDIT] },
                  '$amount',
                  {
                    $cond: [
                      { $eq: ['$type', LEDGER_TRANSACTION_TYPE.DEBIT] },
                      { $multiply: ['$amount', -1] },
                      0
                    ]
                  }
                ]
              }
            }
          }
        }
      ])
      .toArray()

    for (const { _id, total } of aggregated) {
      totals.set(_id, toNumber(/** @type {*} */ (total)))
    }

    return totals
  }

/**
 * Creates a MongoDB-backed ledger repository.
 *
 * @param {Db} db
 * @returns {Promise<import('./ledger-port.js').LedgerRepositoryFactory>}
 */
export const createMongoLedgerRepository = async (db) => {
  const collection = await ensureLedgerCollection(db)

  return () => ({
    insertTransactions: performInsertTransactions(collection),
    findLatestByAccreditationId: performFindLatestByAccreditationId(collection),
    findCreditedAmountsByWasteRecordIds:
      performFindCreditedAmountsByWasteRecordIds(collection)
  })
}

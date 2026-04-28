/** @import { Collection, Db } from 'mongodb' */

/**
 * @typedef {import('./ledger-schema.js').LedgerTransactionInsert} LedgerTransactionInsert
 */

/**
 * @typedef {import('./ledger-schema.js').LedgerTransaction} LedgerTransaction
 */

import { LedgerSlotConflictError } from './ledger-port.js'
import { LEDGER_SOURCE_KIND, LEDGER_TRANSACTION_TYPE } from './ledger-schema.js'
import {
  validateLedgerTransactionInsert,
  validateLedgerTransactionRead
} from './ledger-validation.js'

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

  await collection.createIndex(
    { organisationId: 1, accreditationId: 1, number: -1 },
    { name: 'organisationId_accreditationId_number' }
  )

  await collection.createIndex(
    { registrationId: 1, accreditationId: 1, number: -1 },
    { name: 'registrationId_accreditationId_number' }
  )

  return collection
}

const toLedgerTransaction = (doc) => {
  const { _id, ...rest } = doc
  return validateLedgerTransactionRead({ id: _id.toString(), ...rest })
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

  try {
    const result = await collection.insertMany(validated, { ordered: true })
    return validated.map((transaction, index) =>
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
 * @param {Collection} collection
 * @returns {(filter: object) => Promise<LedgerTransaction[]>}
 */
const performFindOrdered = (collection) => async (filter) => {
  const docs = await collection.find(filter).sort({ number: 1 }).toArray()
  return docs.map(toLedgerTransaction)
}

/**
 * @param {Collection} collection
 * @returns {(wasteRecordIds: string[]) => Promise<Map<string, number>>}
 */
const performFindCreditedAmountsByWasteRecordIds =
  (collection) => async (wasteRecordIds) => {
    const result = new Map(wasteRecordIds.map((id) => [id, 0]))
    if (wasteRecordIds.length === 0) {
      return result
    }

    const aggregation = collection.aggregate([
      {
        $match: {
          'source.kind': LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
          'source.summaryLogRow.wasteRecordId': { $in: wasteRecordIds }
        }
      },
      {
        $group: {
          _id: '$source.summaryLogRow.wasteRecordId',
          credited: {
            $sum: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ['$type', LEDGER_TRANSACTION_TYPE.CREDIT] },
                    then: '$amount'
                  },
                  {
                    case: { $eq: ['$type', LEDGER_TRANSACTION_TYPE.DEBIT] },
                    then: { $multiply: ['$amount', -1] }
                  }
                ],
                default: 0
              }
            }
          }
        }
      }
    ])

    for await (const row of aggregation) {
      result.set(row._id, row.credited)
    }
    return result
  }

/**
 * Returns the latest transaction (highest `number`) per accreditation among
 * documents matching `parentField === parentId`. A single aggregation pass:
 * the index `(parentField, accreditationId, number)` (descending on number)
 * lets the planner find the head row per accreditation directly.
 *
 * @param {Collection} collection
 * @param {string} parentField
 * @returns {(parentId: string) => Promise<LedgerTransaction[]>}
 */
const performFindLatestPerAccreditationByParent =
  (collection, parentField) => async (parentId) => {
    const aggregation = collection.aggregate([
      { $match: { [parentField]: parentId } },
      { $sort: { accreditationId: 1, number: -1 } },
      {
        $group: {
          _id: '$accreditationId',
          latest: { $first: '$$ROOT' }
        }
      },
      { $replaceRoot: { newRoot: '$latest' } }
    ])

    const docs = await aggregation.toArray()
    return docs.map(toLedgerTransaction)
  }

/**
 * Creates a MongoDB-backed ledger repository.
 *
 * @param {Db} db
 * @returns {Promise<import('./ledger-port.js').LedgerRepositoryFactory>}
 */
export const createMongoLedgerRepository = async (db) => {
  const collection = await ensureLedgerCollection(db)
  const findOrdered = performFindOrdered(collection)

  return () => ({
    insertTransactions: performInsertTransactions(collection),
    findLatestByAccreditationId: performFindLatestByAccreditationId(collection),
    findTransactionsBySummaryLogId: (summaryLogId) =>
      findOrdered({
        'source.kind': LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
        'source.summaryLogRow.summaryLogId': summaryLogId
      }),
    findTransactionsByWasteRecordId: (wasteRecordId) =>
      findOrdered({
        'source.kind': LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
        'source.summaryLogRow.wasteRecordId': wasteRecordId
      }),
    findTransactionsByPrnId: (prnId) =>
      findOrdered({
        'source.kind': LEDGER_SOURCE_KIND.PRN_OPERATION,
        'source.prnOperation.prnId': prnId
      }),
    findTransactionsByRow: ({ summaryLogId, rowId, rowType }) =>
      findOrdered({
        'source.kind': LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
        'source.summaryLogRow.summaryLogId': summaryLogId,
        'source.summaryLogRow.rowId': rowId,
        'source.summaryLogRow.rowType': rowType
      }),
    findCreditedAmountsByWasteRecordIds:
      performFindCreditedAmountsByWasteRecordIds(collection),
    findLatestPerAccreditationByOrganisationId:
      performFindLatestPerAccreditationByParent(collection, 'organisationId'),
    findLatestPerAccreditationByRegistrationId:
      performFindLatestPerAccreditationByParent(collection, 'registrationId')
  })
}

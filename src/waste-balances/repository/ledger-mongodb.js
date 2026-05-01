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
    {
      accreditationId: 1,
      'source.summaryLogRow.wasteRecord.type': 1,
      'source.summaryLogRow.wasteRecord.rowId': 1,
      number: -1
    },
    { name: 'summaryLogRow_wasteRecord_findLatest' }
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
 * Stable map key for a waste record `(type, rowId)`. Private to this
 * adapter — Maps need primitive-or-reference equality, so we synthesise a
 * string for lookup. Never persisted.
 *
 * @param {{ type: string, rowId: string }} record
 */
const wasteRecordKey = ({ type, rowId }) => `${type}:${rowId}`

/**
 * Resolve the running per-waste-record credited total for a batch. For each
 * input `(type, rowId)`, runs a `findOne` against the find-latest secondary
 * index — descending `number`, `limit(1)` — and stamps the persisted
 * `wasteRecord.creditedAmount` into the lookup map. Records with no prior
 * matching transaction return `0`.
 *
 * The `accreditationId` filter is load-bearing: `(type, rowId)` is unique
 * within an accreditation but not globally, so two accreditations can
 * legitimately use the same `(exported, "1")` pair.
 *
 * @param {Collection} collection
 * @returns {(accreditationId: string, wasteRecords: Array<{ type: string, rowId: string }>) => Promise<import('./ledger-port.js').CreditedAmountLookup>}
 */
const performFindLatestCreditedAmountsByWasteRecords =
  (collection) => async (accreditationId, wasteRecords) => {
    const uniqueByKey = new Map()
    for (const record of wasteRecords) {
      uniqueByKey.set(wasteRecordKey(record), record)
    }

    const credited = new Map()

    await Promise.all(
      Array.from(uniqueByKey, async ([key, record]) => {
        const doc = await collection.findOne(
          {
            accreditationId,
            'source.summaryLogRow.wasteRecord.type': record.type,
            'source.summaryLogRow.wasteRecord.rowId': record.rowId
          },
          { sort: { number: -1 } }
        )

        if (doc) {
          const decoded = ledgerDocumentFromMongo(/** @type {*} */ (doc))
          credited.set(
            key,
            decoded.source.summaryLogRow.wasteRecord.creditedAmount
          )
        }
      })
    )

    return (record) => credited.get(wasteRecordKey(record)) ?? 0
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
    findLatestCreditedAmountsByWasteRecords:
      performFindLatestCreditedAmountsByWasteRecords(collection)
  })
}

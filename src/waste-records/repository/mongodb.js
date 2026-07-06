/** @import { Collection, Db } from 'mongodb' */

import { createHash } from 'node:crypto'

/**
 * @typedef {import('./schema.js').SummaryLogRowState} SummaryLogRowState
 */

/**
 * @typedef {import('./schema.js').SummaryLogRowStateInsert} SummaryLogRowStateInsert
 */

/**
 * @typedef {import('./schema.js').SummaryLogRowStateEntry} SummaryLogRowStateEntry
 */

/**
 * @typedef {import('./schema.js').WasteBalanceLedgerId} WasteBalanceLedgerId
 */

import {
  validateSummaryLogRowStateInsert,
  validateSummaryLogRowStateRead
} from './validation.js'

export const SUMMARY_LOG_ROW_STATES_COLLECTION_NAME = 'summary-log-row-states'

/**
 * Ensures the row-states collection exists with the indexes required by the
 * summary-log row state design: a multikey index on `summaryLogIds` for the
 * committed-state membership query, a row-identity index for row history, and a
 * unique index on the summary-log-row-state identity (ledger identity + content hash)
 * that makes the content-addressed dedup atomic under concurrent writers.
 *
 * Safe to call multiple times — MongoDB `createIndex` is idempotent for
 * matching specifications.
 *
 * @param {Db} db
 * @returns {Promise<Collection>}
 */
export async function ensureSummaryLogRowStatesCollection(db) {
  const collection = db.collection(SUMMARY_LOG_ROW_STATES_COLLECTION_NAME)

  await collection.createIndex(
    { summaryLogIds: 1 },
    { name: 'summary_log_membership' }
  )

  await collection.createIndex(
    {
      organisationId: 1,
      registrationId: 1,
      rowId: 1,
      wasteRecordType: 1
    },
    { name: 'row_history' }
  )

  await collection.createIndex(
    {
      organisationId: 1,
      registrationId: 1,
      accreditationId: 1,
      rowId: 1,
      wasteRecordType: 1,
      contentHash: 1
    },
    { name: 'summary_log_row_state_identity', unique: true }
  )

  return collection
}

const toSummaryLogRowState = (doc) => {
  const { _id, contentHash: _contentHash, ...rest } = doc
  return validateSummaryLogRowStateRead({ id: _id.toString(), ...rest })
}

/**
 * Recursively orders object keys so that two semantically equal waste record
 * states serialise to the same string, making the content hash independent of
 * property insertion order.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
const canonicalise = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonicalise)
  }
  if (value !== null && typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => (a > b ? 1 : -1))
      .reduce((ordered, key) => {
        ordered[key] = canonicalise(
          /** @type {Record<string, unknown>} */ (value)[key]
        )
        return ordered
      }, /** @type {Record<string, unknown>} */ ({}))
  }
  return value
}

/**
 * @param {SummaryLogRowStateInsert} candidate
 * @returns {string}
 */
const hashSummaryLogRowState = (candidate) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        canonicalise({
          data: candidate.data,
          classification: candidate.classification
        })
      )
    )
    .digest('hex')

/**
 * @param {Collection} collection
 * @param {SummaryLogRowStateInsert} candidate
 * @param {string} contentHash
 * @returns {Promise<import('mongodb').WithId<import('mongodb').Document> | null>}
 */
const findCommittedStateDoc = (collection, candidate, contentHash) =>
  collection.findOne({
    organisationId: candidate.organisationId,
    registrationId: candidate.registrationId,
    accreditationId: candidate.accreditationId,
    rowId: candidate.rowId,
    wasteRecordType: candidate.wasteRecordType,
    contentHash
  })

/**
 * @param {Collection} collection
 * @param {import('mongodb').ObjectId} _id
 * @param {string} summaryLogId
 * @returns {Promise<SummaryLogRowState>}
 */
const addMembership = async (collection, _id, summaryLogId) => {
  await collection.updateOne(
    { _id },
    { $addToSet: { summaryLogIds: summaryLogId } }
  )
  const updated = await collection.findOne({ _id })
  return toSummaryLogRowState(updated)
}

/**
 * @param {Collection} collection
 * @param {WasteBalanceLedgerId} ledgerId
 * @param {SummaryLogRowStateEntry} entry
 * @param {string} summaryLogId
 * @returns {Promise<SummaryLogRowState>}
 */
const upsertOne = async (collection, ledgerId, entry, summaryLogId) => {
  const candidate = validateSummaryLogRowStateInsert({
    organisationId: ledgerId.organisationId,
    registrationId: ledgerId.registrationId,
    accreditationId: ledgerId.accreditationId,
    wasteRecordType: entry.wasteRecordType,
    rowId: entry.rowId,
    data: entry.data,
    classification: entry.classification,
    summaryLogIds: [summaryLogId]
  })
  const contentHash = hashSummaryLogRowState(candidate)

  const existing = await findCommittedStateDoc(
    collection,
    candidate,
    contentHash
  )
  if (existing) {
    return addMembership(collection, existing._id, summaryLogId)
  }

  try {
    const result = await collection.insertOne({ ...candidate, contentHash })
    return toSummaryLogRowState({
      _id: result.insertedId,
      ...candidate,
      contentHash
    })
  } catch (error) {
    const winner = await findCommittedStateDoc(
      collection,
      candidate,
      contentHash
    )
    if (!winner) {
      throw error
    }
    return addMembership(collection, winner._id, summaryLogId)
  }
}

/**
 * @param {Collection} collection
 * @returns {(ledgerId: WasteBalanceLedgerId, summaryLogRowStates: SummaryLogRowStateEntry[], summaryLogId: string) => Promise<SummaryLogRowState[]>}
 */
const performUpsertSummaryLogRowStates =
  (collection) => async (ledgerId, summaryLogRowStates, summaryLogId) => {
    const results = []
    for (const entry of summaryLogRowStates) {
      results.push(await upsertOne(collection, ledgerId, entry, summaryLogId))
    }
    return results
  }

/**
 * @param {Collection} collection
 * @returns {(summaryLogId: string) => Promise<SummaryLogRowState[]>}
 */
const performFindBySummaryLogId = (collection) => async (summaryLogId) => {
  const docs = await collection
    .find({ summaryLogIds: summaryLogId })
    .sort({ _id: 1 })
    .toArray()
  return docs.map(toSummaryLogRowState)
}

/**
 * @param {Collection} collection
 * @returns {(organisationId: string, registrationId: string, rowId: string, wasteRecordType: string) => Promise<SummaryLogRowState[]>}
 */
const performFindRowHistory =
  (collection) =>
  async (organisationId, registrationId, rowId, wasteRecordType) => {
    const docs = await collection
      .find({ organisationId, registrationId, rowId, wasteRecordType })
      .sort({ _id: 1 })
      .toArray()
    return docs.map(toSummaryLogRowState)
  }

/**
 * Creates a MongoDB-backed summary-log row state repository.
 *
 * @param {Db} db
 * @returns {Promise<import('./port.js').SummaryLogRowStateRepositoryFactory>}
 */
export const createMongoSummaryLogRowStateRepository = async (db) => {
  const collection = await ensureSummaryLogRowStatesCollection(db)

  return () => ({
    upsertSummaryLogRowStates: performUpsertSummaryLogRowStates(collection),
    findBySummaryLogId: performFindBySummaryLogId(collection),
    findRowHistory: performFindRowHistory(collection)
  })
}

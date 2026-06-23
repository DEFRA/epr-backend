/** @import { Collection, Db } from 'mongodb' */

import { isDeepStrictEqual } from 'node:util'

/**
 * @typedef {import('./schema.js').RowState} RowState
 */

/**
 * @typedef {import('./schema.js').RowStateInsert} RowStateInsert
 */

/**
 * @typedef {import('./schema.js').RowStateEntry} RowStateEntry
 */

/**
 * @typedef {import('./schema.js').RowStatePartition} RowStatePartition
 */

import { validateRowStateInsert, validateRowStateRead } from './validation.js'

export const WASTE_BALANCE_ROW_STATES_COLLECTION_NAME =
  'waste-balance-row-states'

/**
 * Ensures the row-states collection exists with the indexes required by the
 * waste record state design: a multikey index on `summaryLogIds` for the
 * committed-state membership query, and a row-identity index for row history.
 *
 * Safe to call multiple times — MongoDB `createIndex` is idempotent for
 * matching specifications.
 *
 * @param {Db} db
 * @returns {Promise<Collection>}
 */
export async function ensureRowStatesCollection(db) {
  const collection = db.collection(WASTE_BALANCE_ROW_STATES_COLLECTION_NAME)

  await collection.createIndex({ summaryLogIds: 1 }, { name: 'membership' })

  await collection.createIndex(
    {
      organisationId: 1,
      registrationId: 1,
      rowId: 1,
      wasteRecordType: 1
    },
    { name: 'row_history' }
  )

  return collection
}

const toRowState = (doc) => {
  const { _id, ...rest } = doc
  return validateRowStateRead({ id: _id.toString(), ...rest })
}

/**
 * @param {Collection} collection
 * @param {RowStateInsert} candidate
 * @returns {Promise<{ _id: import('mongodb').ObjectId } | undefined>}
 */
const findCommittedStateDoc = async (collection, candidate) => {
  const existing = await collection
    .find({
      organisationId: candidate.organisationId,
      registrationId: candidate.registrationId,
      accreditationId: candidate.accreditationId,
      rowId: candidate.rowId,
      wasteRecordType: candidate.wasteRecordType
    })
    .toArray()

  return existing.find(
    (doc) =>
      isDeepStrictEqual(doc.data, candidate.data) &&
      isDeepStrictEqual(doc.classification, candidate.classification)
  )
}

/**
 * @param {Collection} collection
 * @param {RowStatePartition} partition
 * @param {RowStateEntry} entry
 * @param {string} summaryLogId
 * @returns {Promise<RowState>}
 */
const upsertOne = async (collection, partition, entry, summaryLogId) => {
  const candidate = validateRowStateInsert({
    organisationId: partition.organisationId,
    registrationId: partition.registrationId,
    accreditationId: partition.accreditationId,
    wasteRecordType: entry.wasteRecordType,
    rowId: entry.rowId,
    data: entry.data,
    classification: entry.classification,
    summaryLogIds: [summaryLogId]
  })

  const match = await findCommittedStateDoc(collection, candidate)

  if (match) {
    await collection.updateOne(
      { _id: match._id },
      { $addToSet: { summaryLogIds: summaryLogId } }
    )
    const updated = await collection.findOne({ _id: match._id })
    return toRowState(updated)
  }

  const result = await collection.insertOne(candidate)
  return toRowState({ _id: result.insertedId, ...candidate })
}

/**
 * @param {Collection} collection
 * @returns {(partition: RowStatePartition, rowStates: RowStateEntry[], summaryLogId: string) => Promise<RowState[]>}
 */
const performUpsertRowStates =
  (collection) => async (partition, rowStates, summaryLogId) => {
    const results = []
    for (const entry of rowStates) {
      results.push(await upsertOne(collection, partition, entry, summaryLogId))
    }
    return results
  }

/**
 * @param {Collection} collection
 * @returns {(summaryLogId: string) => Promise<RowState[]>}
 */
const performFindBySummaryLogId = (collection) => async (summaryLogId) => {
  const docs = await collection
    .find({ summaryLogIds: summaryLogId })
    .sort({ _id: 1 })
    .toArray()
  return docs.map(toRowState)
}

/**
 * @param {Collection} collection
 * @returns {(organisationId: string, registrationId: string, rowId: string, wasteRecordType: string) => Promise<RowState[]>}
 */
const performFindRowHistory =
  (collection) =>
  async (organisationId, registrationId, rowId, wasteRecordType) => {
    const docs = await collection
      .find({ organisationId, registrationId, rowId, wasteRecordType })
      .sort({ _id: 1 })
      .toArray()
    return docs.map(toRowState)
  }

/**
 * Creates a MongoDB-backed waste record state repository.
 *
 * @param {Db} db
 * @returns {Promise<import('./port.js').RowStateRepositoryFactory>}
 */
export const createMongoRowStateRepository = async (db) => {
  const collection = await ensureRowStatesCollection(db)

  return () => ({
    upsertRowStates: performUpsertRowStates(collection),
    findBySummaryLogId: performFindBySummaryLogId(collection),
    findRowHistory: performFindRowHistory(collection)
  })
}

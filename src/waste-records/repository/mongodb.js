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
          processingType: candidate.processingType,
          data: candidate.data,
          classification: candidate.classification
        })
      )
    )
    .digest('hex')

/**
 * Builds the content-addressed identity filter for a row state — exactly the
 * fields of the unique `summary_log_row_state_identity` index. Using the unique
 * key as the upsert filter is what makes concurrent writers converge on a
 * single document: MongoDB retries the upsert against the winning insert
 * instead of surfacing a duplicate-key error.
 *
 * @param {SummaryLogRowStateInsert} candidate
 * @param {string} contentHash
 */
const buildIdentityFilter = (candidate, contentHash) => ({
  organisationId: candidate.organisationId,
  registrationId: candidate.registrationId,
  accreditationId: candidate.accreditationId,
  rowId: candidate.rowId,
  wasteRecordType: candidate.wasteRecordType,
  contentHash
})

const identityKey = (fields) =>
  JSON.stringify([
    fields.organisationId,
    fields.registrationId,
    fields.accreditationId,
    fields.rowId,
    fields.wasteRecordType,
    fields.contentHash
  ])

/**
 * The row states a ledger holds at one summary log — the filter behind both
 * the read model's query and the write path's read-back. A row state belongs
 * to the ledger that wrote it, so the summary log alone does not identify it.
 *
 * @param {WasteBalanceLedgerId} ledgerId
 * @param {string} summaryLogId
 */
const buildSummaryLogFilter = (ledgerId, summaryLogId) => ({
  organisationId: ledgerId.organisationId,
  registrationId: ledgerId.registrationId,
  accreditationId: ledgerId.accreditationId,
  summaryLogIds: summaryLogId
})

/**
 * @param {SummaryLogRowStateInsert} candidate
 * @param {string} contentHash
 * @param {string} summaryLogId
 */
const buildUpsertOperation = (candidate, contentHash, summaryLogId) => ({
  updateOne: {
    filter: buildIdentityFilter(candidate, contentHash),
    // Identity fields materialise from the filter on insert, so they stay out
    // of $setOnInsert to avoid the filter/setOnInsert path conflict.
    update: {
      $setOnInsert: {
        processingType: candidate.processingType,
        data: candidate.data,
        classification: candidate.classification
      },
      $addToSet: { summaryLogIds: summaryLogId }
    },
    upsert: true
  }
})

/**
 * @param {WasteBalanceLedgerId} ledgerId
 * @param {SummaryLogRowStateEntry} entry
 * @param {string} summaryLogId
 */
const prepareRowState = (ledgerId, entry, summaryLogId) => {
  const candidate = validateSummaryLogRowStateInsert({
    organisationId: ledgerId.organisationId,
    registrationId: ledgerId.registrationId,
    accreditationId: ledgerId.accreditationId,
    wasteRecordType: entry.wasteRecordType,
    rowId: entry.rowId,
    processingType: entry.processingType,
    data: entry.data,
    classification: entry.classification,
    summaryLogIds: [summaryLogId]
  })
  return { candidate, contentHash: hashSummaryLogRowState(candidate) }
}

/**
 * Commits a whole submission's row states in one round trip: a single
 * `bulkWrite` of content-addressed upserts, then one `find` to read the
 * committed documents back. Round-trip cost is independent of the row count,
 * unlike the per-row upsert it replaces. Results are returned one per input
 * entry, in input order — the `find` result is keyed back to the entries by
 * their content-addressed identity.
 *
 * @param {Collection} collection
 * @returns {(ledgerId: WasteBalanceLedgerId, summaryLogRowStates: SummaryLogRowStateEntry[], summaryLogId: string) => Promise<SummaryLogRowState[]>}
 */
const performUpsertSummaryLogRowStates =
  (collection) => async (ledgerId, summaryLogRowStates, summaryLogId) => {
    if (summaryLogRowStates.length === 0) {
      return []
    }

    const prepared = summaryLogRowStates.map((entry) =>
      prepareRowState(ledgerId, entry, summaryLogId)
    )

    await collection.bulkWrite(
      prepared.map(({ candidate, contentHash }) =>
        buildUpsertOperation(candidate, contentHash, summaryLogId)
      ),
      { ordered: false }
    )

    const committed = await collection
      .find(buildSummaryLogFilter(ledgerId, summaryLogId))
      .toArray()
    const committedByIdentity = new Map(
      committed.map((doc) => [identityKey(doc), doc])
    )

    return prepared.map(({ candidate, contentHash }) =>
      toSummaryLogRowState(
        committedByIdentity.get(
          identityKey(buildIdentityFilter(candidate, contentHash))
        )
      )
    )
  }

/**
 * @param {Collection} collection
 * @returns {(ledgerId: WasteBalanceLedgerId, summaryLogId: string) => Promise<SummaryLogRowState[]>}
 */
const performFindRowStatesForSummaryLog =
  (collection) => async (ledgerId, summaryLogId) => {
    const docs = await collection
      .find(buildSummaryLogFilter(ledgerId, summaryLogId))
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
    findRowStatesForSummaryLog: performFindRowStatesForSummaryLog(collection),
    findRowHistory: performFindRowHistory(collection)
  })
}

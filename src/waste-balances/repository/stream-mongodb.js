/** @import { Collection, Db } from 'mongodb' */

/**
 * @typedef {import('./stream-schema.js').StreamEventInsert} StreamEventInsert
 */

/**
 * @typedef {import('./stream-schema.js').StreamEvent} StreamEvent
 */

import { STREAM_EVENT_KIND } from './stream-schema.js'
import {
  streamDocumentFromMongo,
  streamInsertToMongo
} from './stream-decimal.js'
import {
  StreamSlotConflictError,
  StreamIdempotencyConflictError
} from './stream-port.js'
import {
  validateStreamEventInsert,
  validateStreamEventRead
} from './stream-validation.js'

export const WASTE_BALANCE_EVENTS_COLLECTION_NAME = 'waste-balance-events'

const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000

const PRN_KINDS = [
  STREAM_EVENT_KIND.PRN_CREATED,
  STREAM_EVENT_KIND.PRN_ISSUED,
  STREAM_EVENT_KIND.PRN_CREATION_CANCELLED,
  STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE
]

const INDEX_NAME_SLOT = 'partition_number'
const INDEX_NAME_SUMMARY_LOG_IDEMPOTENCY = 'idempotency_summary_log'
const INDEX_NAME_PRN_IDEMPOTENCY = 'idempotency_prn'

/**
 * Ensures the stream collection exists with the indexes required by the
 * event-sourced stream design.
 *
 * Safe to call multiple times — MongoDB `createIndex` is idempotent for
 * matching specifications.
 *
 * @param {Db} db
 * @returns {Promise<Collection>}
 */
export async function ensureStreamCollection(db) {
  const collection = db.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)

  await collection.createIndex(
    { registrationId: 1, accreditationId: 1, number: 1 },
    { name: INDEX_NAME_SLOT, unique: true }
  )

  await collection.createIndex(
    {
      registrationId: 1,
      accreditationId: 1,
      kind: 1,
      'payload.summaryLogId': 1
    },
    {
      name: INDEX_NAME_SUMMARY_LOG_IDEMPOTENCY,
      unique: true,
      partialFilterExpression: {
        kind: STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      }
    }
  )

  await collection.createIndex(
    { registrationId: 1, accreditationId: 1, kind: 1, 'payload.prnId': 1 },
    {
      name: INDEX_NAME_PRN_IDEMPOTENCY,
      unique: true,
      partialFilterExpression: { kind: { $in: PRN_KINDS } }
    }
  )

  await collection.createIndex(
    { registrationId: 1, accreditationId: 1, kind: 1, number: -1 },
    { name: 'partition_kind_latest' }
  )

  await collection.createIndex(
    { 'payload.prnId': 1, number: 1 },
    { name: 'prn_watermark_catchup' }
  )

  return collection
}

const toStreamEvent = (doc) => {
  const { _id, ...rest } = doc
  return validateStreamEventRead({
    id: _id.toString(),
    ...streamDocumentFromMongo(rest)
  })
}

/**
 * Classify a MongoDB E11000 duplicate key error by inspecting the
 * `keyPattern` on the write error to determine which index was violated.
 *
 * @param {unknown} error
 * @param {StreamEventInsert} event
 */
const classifyDuplicateKeyError = (error, event) => {
  const writeError = findDuplicateKeyWriteError(error)
  if (!writeError) {
    return undefined
  }

  const keyPattern = writeError.keyPattern ?? {}

  if (keyPattern.number) {
    return new StreamSlotConflictError(
      event.registrationId,
      event.accreditationId,
      event.number
    )
  }

  if (keyPattern['payload.summaryLogId']) {
    return new StreamIdempotencyConflictError(
      event.kind,
      /** @type {*} */ (event.payload).summaryLogId
    )
  }

  if (keyPattern['payload.prnId']) {
    return new StreamIdempotencyConflictError(
      event.kind,
      /** @type {*} */ (event.payload).prnId
    )
  }

  return undefined
}

/**
 * @param {unknown} candidate
 * @returns {candidate is { code: number, keyPattern?: Record<string, number> }}
 */
const isDuplicateKeyWriteError = (candidate) =>
  typeof candidate === 'object' &&
  candidate !== null &&
  'code' in candidate &&
  candidate.code === MONGODB_DUPLICATE_KEY_ERROR_CODE

/**
 * @param {unknown} error
 */
const findDuplicateKeyWriteError = (error) => {
  if (isDuplicateKeyWriteError(error)) {
    return /** @type {{ code: number, keyPattern?: Record<string, number> }} */ (
      error
    )
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'writeErrors' in error &&
    Array.isArray(error.writeErrors)
  ) {
    return error.writeErrors.find(isDuplicateKeyWriteError)
  }

  return undefined
}

/**
 * @param {Collection} collection
 * @returns {(event: StreamEventInsert) => Promise<StreamEvent>}
 */
const performAppendEvent = (collection) => async (event) => {
  const validated = validateStreamEventInsert(event)
  const persistable = streamInsertToMongo(validated)

  try {
    const result = await collection.insertOne(persistable)
    return toStreamEvent({ _id: result.insertedId, ...persistable })
  } catch (error) {
    const classified = classifyDuplicateKeyError(error, validated)
    if (classified) {
      throw classified
    }
    throw error
  }
}

/**
 * @param {Collection} collection
 * @returns {(registrationId: string, accreditationId: string | null) => Promise<StreamEvent | null>}
 */
const performFindLatestByPartition =
  (collection) => async (registrationId, accreditationId) => {
    const doc = await collection.findOne(
      { registrationId, accreditationId },
      { sort: { number: -1 } }
    )
    return doc ? toStreamEvent(doc) : null
  }

/**
 * @param {Collection} collection
 * @returns {(registrationId: string, accreditationId: string | null, kind: string) => Promise<StreamEvent | null>}
 */
const performFindLatestByPartitionAndKind =
  (collection) => async (registrationId, accreditationId, kind) => {
    const doc = await collection.findOne(
      { registrationId, accreditationId, kind },
      { sort: { number: -1 } }
    )
    return doc ? toStreamEvent(doc) : null
  }

/**
 * @param {Collection} collection
 * @returns {(prnId: string, afterNumber: number) => Promise<StreamEvent[]>}
 */
const performFindEventsByPrnIdAfter =
  (collection) => async (prnId, afterNumber) => {
    const docs = await collection
      .find({
        'payload.prnId': prnId,
        number: { $gt: afterNumber }
      })
      .sort({ number: 1 })
      .toArray()

    return docs.map(toStreamEvent)
  }

/**
 * @param {Collection} collection
 * @returns {(registrationId: string, accreditationId: string | null) => Promise<void>}
 */
const performDeleteAllForPartition =
  (collection) => async (registrationId, accreditationId) => {
    await collection.deleteMany({ registrationId, accreditationId })
  }

/**
 * Creates a MongoDB-backed stream repository.
 *
 * @param {Db} db
 * @returns {Promise<import('./stream-port.js').StreamRepositoryFactory>}
 */
export const createMongoStreamRepository = async (db) => {
  const collection = await ensureStreamCollection(db)

  return () => ({
    appendEvent: performAppendEvent(collection),
    findLatestByPartition: performFindLatestByPartition(collection),
    findLatestByPartitionAndKind:
      performFindLatestByPartitionAndKind(collection),
    findEventsByPrnIdAfter: performFindEventsByPrnIdAfter(collection),
    deleteAllForPartition: performDeleteAllForPartition(collection)
  })
}

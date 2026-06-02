/** @import { Collection, Db } from 'mongodb' */

/**
 * @typedef {import('./stream-schema.js').StreamEventInsert} StreamEventInsert
 */

/**
 * @typedef {import('./stream-schema.js').StreamEvent} StreamEvent
 */

import { StreamSlotConflictError, StreamSequenceError } from './stream-port.js'
import {
  validateStreamEventInsert,
  validateStreamEventRead
} from './stream-validation.js'

export const WASTE_BALANCE_EVENTS_COLLECTION_NAME = 'waste-balance-events'

const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000

const INDEX_NAME_SLOT = 'partition_number'

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
    { registrationId: 1, accreditationId: 1, kind: 1, number: -1 },
    { name: 'partition_kind_latest' }
  )

  await collection.createIndex(
    {
      registrationId: 1,
      accreditationId: 1,
      'payload.prnId': 1,
      number: 1
    },
    { name: 'prn_watermark_catchup' }
  )

  await collection.createIndex(
    { registrationId: 1, accreditationId: 1, kind: 1, 'payload.prnId': 1 },
    {
      name: 'prn_idempotency',
      unique: true,
      partialFilterExpression: { 'payload.prnId': { $exists: true } }
    }
  )

  await collection.createIndex(
    {
      registrationId: 1,
      accreditationId: 1,
      kind: 1,
      'payload.summaryLogId': 1
    },
    {
      name: 'summary_log_idempotency',
      unique: true,
      partialFilterExpression: { 'payload.summaryLogId': { $exists: true } }
    }
  )

  return collection
}

const toStreamEvent = (doc) => {
  const { _id, ...rest } = doc
  return validateStreamEventRead({
    id: _id.toString(),
    ...rest
  })
}

/**
 * Classify a MongoDB E11000 duplicate key error by inspecting the
 * `keyPattern` on the write error to determine which index was violated.
 *
 * The slot index `(registrationId, accreditationId, number)` maps to a
 * `StreamSlotConflictError`. The per-kind natural-key indexes
 * (`payload.prnId` / `payload.summaryLogId`) signal that the same logical
 * event is already persisted, so the append is a safe no-op.
 *
 * @param {unknown} error
 * @param {StreamEventInsert} event
 * @returns {StreamSlotConflictError | { naturalKeyConflict: true } | undefined}
 */
const classifyDuplicateKeyError = (error, event) => {
  const writeError = findDuplicateKeyWriteError(error)
  if (!writeError) {
    return undefined
  }

  if (writeError.keyPattern?.number) {
    return new StreamSlotConflictError(
      event.registrationId,
      event.accreditationId,
      event.number
    )
  }

  if (
    writeError.keyPattern?.['payload.prnId'] ||
    writeError.keyPattern?.['payload.summaryLogId']
  ) {
    return { naturalKeyConflict: true }
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

  const latest = await collection.findOne(
    {
      registrationId: validated.registrationId,
      accreditationId: validated.accreditationId
    },
    { sort: { number: -1 }, projection: { number: 1 } }
  )

  const expectedNumber = (latest?.number ?? 0) + 1

  if (validated.number !== expectedNumber) {
    if (validated.number <= (latest?.number ?? 0)) {
      throw new StreamSlotConflictError(
        validated.registrationId,
        validated.accreditationId,
        validated.number
      )
    }
    throw new StreamSequenceError(
      validated.registrationId,
      validated.accreditationId,
      validated.number,
      expectedNumber
    )
  }

  try {
    const result = await collection.insertOne(validated)
    return toStreamEvent({ _id: result.insertedId, ...validated })
  } catch (error) {
    const classified = classifyDuplicateKeyError(error, validated)
    if (classified instanceof StreamSlotConflictError) {
      throw classified
    }
    if (classified) {
      return findEventByNaturalKey(collection, validated)
    }
    throw error
  }
}

/**
 * Fetch the event already persisted under the same per-kind natural key.
 *
 * @param {Collection} collection
 * @param {StreamEventInsert} event
 * @returns {Promise<StreamEvent>}
 */
const findEventByNaturalKey = async (collection, event) => {
  const payloadIdField =
    'prnId' in event.payload ? 'payload.prnId' : 'payload.summaryLogId'
  const payloadIdValue =
    'prnId' in event.payload
      ? event.payload.prnId
      : event.payload.summaryLogId

  const doc = await collection.findOne({
    registrationId: event.registrationId,
    accreditationId: event.accreditationId,
    kind: event.kind,
    [payloadIdField]: payloadIdValue
  })

  return toStreamEvent(doc)
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
 * @returns {(registrationId: string, accreditationId: string | null, prnId: string, afterNumber: number) => Promise<StreamEvent[]>}
 */
const performFindEventsByPrnIdAfter =
  (collection) =>
  async (registrationId, accreditationId, prnId, afterNumber) => {
    const docs = await collection
      .find({
        registrationId,
        accreditationId,
        'payload.prnId': prnId,
        number: { $gt: afterNumber }
      })
      .sort({ number: 1 })
      .toArray()

    return docs.map(toStreamEvent)
  }

/**
 * @migration PAE-1382 — delete all events for a partition.
 * @param {Collection} collection
 * @returns {(registrationId: string, accreditationId: string | null) => Promise<number>}
 */
const performDeleteByPartition =
  (collection) => async (registrationId, accreditationId) => {
    const result = await collection.deleteMany({
      registrationId,
      accreditationId
    })
    return result.deletedCount
  }

/**
 * @migration PAE-1382 — insert multiple events in one call.
 * Validates sequence: events must be numbered sequentially, and the first
 * event's number must be currentMax + 1 (or 1 if empty partition).
 * @param {Collection} collection
 * @returns {(events: import('./stream-schema.js').StreamEventInsert[]) => Promise<import('./stream-schema.js').StreamEvent[]>}
 */
const performBulkAppendEvents = (collection) => async (events) => {
  if (events.length === 0) {
    return []
  }

  const validated = events.map(validateStreamEventInsert)

  const first = validated[0]

  const latest = await collection.findOne(
    {
      registrationId: first.registrationId,
      accreditationId: first.accreditationId
    },
    { sort: { number: -1 }, projection: { number: 1 } }
  )

  const expectedStart = (latest?.number ?? 0) + 1

  if (first.number !== expectedStart) {
    throw new StreamSequenceError(
      first.registrationId,
      first.accreditationId,
      first.number,
      expectedStart
    )
  }

  for (let i = 1; i < validated.length; i++) {
    const expected = first.number + i
    if (validated[i].number !== expected) {
      throw new StreamSequenceError(
        validated[i].registrationId,
        validated[i].accreditationId,
        validated[i].number,
        expected
      )
    }
  }

  const result = await collection.insertMany(validated)

  return validated.map((event, i) =>
    toStreamEvent({ _id: result.insertedIds[i], ...event })
  )
}

/**
 * Creates a MongoDB-backed stream repository.
 *
 * @param {Db} db
 * @returns {Promise<import('./stream-port.js').WasteBalanceStreamRepositoryFactory>}
 */
export const createMongoStreamRepository = async (db) => {
  const collection = await ensureStreamCollection(db)

  return () => ({
    appendEvent: performAppendEvent(collection),
    findLatestByPartition: performFindLatestByPartition(collection),
    findLatestByPartitionAndKind:
      performFindLatestByPartitionAndKind(collection),
    findEventsByPrnIdAfter: performFindEventsByPrnIdAfter(collection),
    deleteByPartition: performDeleteByPartition(collection),
    bulkAppendEvents: performBulkAppendEvents(collection)
  })
}

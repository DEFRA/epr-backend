/** @import { Collection, Db } from 'mongodb' */

/**
 * @typedef {import('./ledger-schema.js').LedgerEventInsert} LedgerEventInsert
 */

/**
 * @typedef {import('./ledger-schema.js').LedgerEvent} LedgerEvent
 */

import { LedgerSlotConflictError, LedgerSequenceError } from './ledger-port.js'
import {
  validateStreamEventInsert,
  validateStreamEventRead
} from './ledger-validation.js'

export const WASTE_BALANCE_EVENTS_COLLECTION_NAME = 'waste-balance-events'

const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000

const INDEX_NAME_SLOT = 'partition_number'

/**
 * Ensures the ledger collection exists with the indexes required by the
 * event-sourced ledger design.
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
 * @param {unknown} error
 * @param {LedgerEventInsert} event
 */
const classifyDuplicateKeyError = (error, event) => {
  const writeError = findDuplicateKeyWriteError(error)
  if (!writeError) {
    return undefined
  }

  if (writeError.keyPattern?.number) {
    return new LedgerSlotConflictError(
      event.registrationId,
      event.accreditationId,
      event.number
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
 * @returns {(registrationId: string, accreditationId: string | null) => Promise<LedgerEvent | null>}
 */
const performFindLatestInLedger =
  (collection) => async (registrationId, accreditationId) => {
    const doc = await collection.findOne(
      { registrationId, accreditationId },
      { sort: { number: -1 } }
    )
    return doc ? toStreamEvent(doc) : null
  }

/**
 * @param {Collection} collection
 * @returns {(registrationId: string, accreditationId: string | null, kind: string) => Promise<LedgerEvent | null>}
 */
const performFindLatestInLedgerByKind =
  (collection) => async (registrationId, accreditationId, kind) => {
    const doc = await collection.findOne(
      { registrationId, accreditationId, kind },
      { sort: { number: -1 } }
    )
    return doc ? toStreamEvent(doc) : null
  }

/**
 * @param {Collection} collection
 * @returns {(registrationId: string, accreditationId: string | null, prnId: string, afterNumber: number) => Promise<LedgerEvent[]>}
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
 * @param {Collection} collection
 * @returns {(registrationId: string, accreditationId: string | null) => Promise<LedgerEvent[]>}
 */
const performFindAllInLedger =
  (collection) => async (registrationId, accreditationId) => {
    const docs = await collection
      .find({ registrationId, accreditationId })
      .sort({ number: 1 })
      .toArray()

    return docs.map(toStreamEvent)
  }

/**
 * @migration PAE-1382 — delete all events for a partition.
 * @param {Collection} collection
 * @returns {(registrationId: string, accreditationId: string | null) => Promise<number>}
 */
const performDeleteInLedger =
  (collection) => async (registrationId, accreditationId) => {
    const result = await collection.deleteMany({
      registrationId,
      accreditationId
    })
    return result.deletedCount
  }

/**
 * Append a contiguous batch of events. Validates sequence: events must be
 * numbered sequentially, and the first event's number must be currentMax + 1
 * (or 1 if empty partition). A starting slot occupied by a competing writer
 * surfaces as a `LedgerSlotConflictError`, whether detected on the pre-check
 * or on the insert itself.
 *
 * Not a transaction: the ordered insert commits each event as it goes and is
 * not rolled back, so a later slot conflict leaves earlier events of the same
 * batch committed.
 * @param {Collection} collection
 * @returns {(events: import('./ledger-schema.js').LedgerEventInsert[]) => Promise<import('./ledger-schema.js').LedgerEvent[]>}
 */
const performAppendEvents = (collection) => async (events) => {
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
    if (first.number <= (latest?.number ?? 0)) {
      throw new LedgerSlotConflictError(
        first.registrationId,
        first.accreditationId,
        first.number
      )
    }
    throw new LedgerSequenceError(
      first.registrationId,
      first.accreditationId,
      first.number,
      expectedStart
    )
  }

  for (let i = 1; i < validated.length; i++) {
    const expected = first.number + i
    if (validated[i].number !== expected) {
      throw new LedgerSequenceError(
        validated[i].registrationId,
        validated[i].accreditationId,
        validated[i].number,
        expected
      )
    }
  }

  try {
    const result = await collection.insertMany(validated)
    return validated.map((event, i) =>
      toStreamEvent({ _id: result.insertedIds[i], ...event })
    )
  } catch (error) {
    const classified = classifyDuplicateKeyError(error, first)
    if (classified) {
      throw classified
    }
    throw error
  }
}

/**
 * Creates a MongoDB-backed ledger repository.
 *
 * @param {Db} db
 * @returns {Promise<import('./ledger-port.js').WasteBalanceLedgerRepositoryFactory>}
 */
export const createMongoLedgerRepository = async (db) => {
  const collection = await ensureStreamCollection(db)

  return () => ({
    findLatestInLedger: performFindLatestInLedger(collection),
    findLatestInLedgerByKind: performFindLatestInLedgerByKind(collection),
    findEventsByPrnIdAfter: performFindEventsByPrnIdAfter(collection),
    findAllInLedger: performFindAllInLedger(collection),
    deleteAllInLedger: performDeleteInLedger(collection),
    appendEvents: performAppendEvents(collection)
  })
}

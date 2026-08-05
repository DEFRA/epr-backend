/** @import { Collection, Db } from 'mongodb' */

/**
 * @typedef {import('./ledger-schema.js').LedgerEventInsert} LedgerEventInsert
 */

/**
 * @typedef {import('./ledger-schema.js').LedgerEvent} LedgerEvent
 */

/**
 * @typedef {import('./ledger-schema.js').WasteBalanceLedgerId} WasteBalanceLedgerId
 */

/**
 * @typedef {import('./ledger-port.js').LatestSubmittedSummaryLogPerLedger} LatestSubmittedSummaryLogPerLedger
 */

import { LedgerSlotConflictError, LedgerSequenceError } from './ledger-port.js'
import { LEDGER_EVENT_KIND } from './ledger-schema.js'
import {
  validateLedgerEventInsert,
  validateLedgerEventRead
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
export async function ensureLedgerCollection(db) {
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
    { kind: 1, number: -1 },
    { name: 'kind_number_report' }
  )

  return collection
}

const toLedgerEvent = (doc) => {
  const { _id, ...rest } = doc
  return validateLedgerEventRead({
    id: _id.toString(),
    ...rest
  })
}

/**
 * Classify a MongoDB E11000 duplicate key error raised by an append.
 *
 * `partition_number` is the only unique index on this collection — the other
 * two are non-unique, and driver-generated `_id`s do not collide — so a
 * duplicate key can only mean a competing writer took the slot.
 *
 * @param {unknown} error
 * @param {LedgerEventInsert} event
 */
const classifyDuplicateKeyError = (error, event) => {
  if (!findDuplicateKeyWriteError(error)) {
    return undefined
  }

  return new LedgerSlotConflictError(event)
}

/**
 * @param {unknown} candidate
 * @returns {candidate is { code: number }}
 */
const isDuplicateKeyWriteError = (candidate) =>
  typeof candidate === 'object' &&
  candidate !== null &&
  'code' in candidate &&
  candidate.code === MONGODB_DUPLICATE_KEY_ERROR_CODE

/**
 * `insertMany` reports a failed write as a `writeErrors` entry on the
 * enclosing `MongoBulkWriteError`. An entry is where a write records its own
 * outcome, so a duplicate key is looked up there rather than on the aggregate.
 *
 * @param {unknown} error
 */
const findDuplicateKeyWriteError = (error) => {
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
 * The filter selecting exactly the events of one ledger. Every per-ledger read
 * builds its filter from this, so no such read can name a ledger by less than
 * its whole id. The cross-ledger reporting query
 * (`findLatestSubmittedSummaryLogPerLedger`) is the deliberate exception: it
 * scans across partitions rather than filtering to one.
 *
 * @param {WasteBalanceLedgerId} ledgerId
 */
const ledgerFilter = ({ organisationId, registrationId, accreditationId }) => ({
  organisationId,
  registrationId,
  accreditationId
})

/**
 * @param {Collection} collection
 * @returns {(ledgerId: WasteBalanceLedgerId) => Promise<LedgerEvent | null>}
 */
const performFindLatestInLedger = (collection) => async (ledgerId) => {
  const doc = await collection.findOne(ledgerFilter(ledgerId), {
    sort: { number: -1 }
  })
  return doc ? toLedgerEvent(doc) : null
}

/**
 * @param {Collection} collection
 * @returns {(ledgerId: WasteBalanceLedgerId, kind: string) => Promise<LedgerEvent | null>}
 */
const performFindLatestInLedgerByKind =
  (collection) => async (ledgerId, kind) => {
    const doc = await collection.findOne(
      { ...ledgerFilter(ledgerId), kind },
      { sort: { number: -1 } }
    )
    return doc ? toLedgerEvent(doc) : null
  }

/**
 * @param {Collection} collection
 * @returns {(ledgerId: WasteBalanceLedgerId, prnId: string, afterNumber: number) => Promise<LedgerEvent[]>}
 */
const performFindEventsByPrnIdAfter =
  (collection) => async (ledgerId, prnId, afterNumber) => {
    const docs = await collection
      .find({
        ...ledgerFilter(ledgerId),
        'payload.prnId': prnId,
        number: { $gt: afterNumber }
      })
      .sort({ number: 1 })
      .toArray()

    return docs.map(toLedgerEvent)
  }

/**
 * @param {Collection} collection
 * @returns {(ledgerId: WasteBalanceLedgerId) => Promise<LedgerEvent[]>}
 */
const performFindAllInLedger = (collection) => async (ledgerId) => {
  const docs = await collection
    .find(ledgerFilter(ledgerId))
    .sort({ number: 1 })
    .toArray()

  return docs.map(toLedgerEvent)
}

/**
 * One entry per ledger partition with a submitted summary log, carrying the
 * latest submission's `summaryLogId`. Sorting descending before the group lets
 * `$first` name the highest-numbered submission per partition.
 *
 * @param {Collection} collection
 * @returns {() => Promise<LatestSubmittedSummaryLogPerLedger[]>}
 */
const performFindLatestSubmittedSummaryLogPerLedger =
  (collection) => async () => {
    const results = await collection
      .aggregate([
        {
          $match: {
            kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
          }
        },
        { $sort: { number: -1 } },
        {
          $group: {
            _id: {
              organisationId: '$organisationId',
              registrationId: '$registrationId',
              accreditationId: '$accreditationId'
            },
            summaryLogId: { $first: '$payload.summaryLogId' }
          }
        },
        { $project: { _id: 0, ledgerId: '$_id', summaryLogId: 1 } }
      ])
      .toArray()

    return /** @type {LatestSubmittedSummaryLogPerLedger[]} */ (results)
  }

/**
 * @migration PAE-1382 — delete all events for a ledgerId.
 * @param {Collection} collection
 * @returns {(ledgerId: WasteBalanceLedgerId) => Promise<number>}
 */
const performDeleteInLedger = (collection) => async (ledgerId) => {
  const result = await collection.deleteMany(ledgerFilter(ledgerId))
  return result.deletedCount
}

/**
 * Append a contiguous batch of events. Validates sequence: events must be
 * numbered sequentially, and the first event's number must be currentMax + 1
 * (or 1 if empty ledger). A starting slot occupied by a competing writer
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

  const validated = events.map(validateLedgerEventInsert)

  const first = validated[0]

  const latest = await collection.findOne(ledgerFilter(first), {
    sort: { number: -1 },
    projection: { number: 1 }
  })

  const expectedStart = (latest?.number ?? 0) + 1

  if (first.number !== expectedStart) {
    if (first.number <= (latest?.number ?? 0)) {
      throw new LedgerSlotConflictError(first)
    }
    throw new LedgerSequenceError(first, expectedStart)
  }

  for (let i = 1; i < validated.length; i++) {
    const expected = first.number + i
    if (validated[i].number !== expected) {
      throw new LedgerSequenceError(validated[i], expected)
    }
  }

  try {
    const result = await collection.insertMany(validated)
    return validated.map((event, i) =>
      toLedgerEvent({ _id: result.insertedIds[i], ...event })
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
  const collection = await ensureLedgerCollection(db)

  return () => ({
    findLatestInLedger: performFindLatestInLedger(collection),
    findLatestInLedgerByKind: performFindLatestInLedgerByKind(collection),
    findEventsByPrnIdAfter: performFindEventsByPrnIdAfter(collection),
    findAllInLedger: performFindAllInLedger(collection),
    findLatestSubmittedSummaryLogPerLedger:
      performFindLatestSubmittedSummaryLogPerLedger(collection),
    deleteAllInLedger: performDeleteInLedger(collection),
    appendEvents: performAppendEvents(collection)
  })
}

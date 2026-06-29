/**
 * Storage-level port for the waste balance event stream.
 *
 * Surface is deliberately minimal: only primitives where two correct adapters
 * could meaningfully implement things differently (persistence, native conflict
 * signal translation). Domain logic — balance arithmetic, retry on
 * slot conflict — lives above the port in `appendToStream`, not on adapters.
 */

/**
 * Raised by `appendEvent` when a `(registrationId, accreditationId, number)`
 * slot is already occupied. Adapters translate their native conflict signal
 * (MongoDB `E11000`, in-memory index check) into this typed error so callers
 * can react uniformly.
 */
export class StreamSlotConflictError extends Error {
  /** @type {string} */
  registrationId
  /** @type {string | null} */
  accreditationId
  /** @type {number} */
  slotNumber

  /**
   * @param {string} registrationId
   * @param {string | null} accreditationId
   * @param {number} slotNumber
   */
  constructor(registrationId, accreditationId, slotNumber) {
    super(
      `Stream slot already occupied for registration ${registrationId} accreditation ${accreditationId} number ${slotNumber}`
    )
    this.name = 'StreamSlotConflictError'
    this.registrationId = registrationId
    this.accreditationId = accreditationId
    this.slotNumber = slotNumber
  }
}

/**
 * Raised by `appendEvent` when the event's `number` is not the next
 * sequential value for its partition. The stream is strictly append-only
 * with no gaps: event N requires event N-1 to exist (or N must be 1 for
 * an empty stream).
 */
export class StreamSequenceError extends Error {
  /** @type {string} */
  registrationId
  /** @type {string | null} */
  accreditationId
  /** @type {number} */
  providedNumber
  /** @type {number} */
  expectedNumber

  /**
   * @param {string} registrationId
   * @param {string | null} accreditationId
   * @param {number} providedNumber
   * @param {number} expectedNumber
   */
  constructor(registrationId, accreditationId, providedNumber, expectedNumber) {
    super(
      `Stream sequence violation for registration ${registrationId} accreditation ${accreditationId}: expected number ${expectedNumber}, got ${providedNumber}`
    )
    this.name = 'StreamSequenceError'
    this.registrationId = registrationId
    this.accreditationId = accreditationId
    this.providedNumber = providedNumber
    this.expectedNumber = expectedNumber
  }
}

/**
 * @typedef {import('./stream-schema.js').StreamEventInsert} StreamEventInsert
 */

/**
 * @typedef {import('./stream-schema.js').StreamEvent} StreamEvent
 */

/**
 * @typedef {Object} WasteBalanceStreamRepository
 * @property {(event: StreamEventInsert) => Promise<StreamEvent>} appendEvent
 *   Persist a single event. Returns the stored event with its assigned `id`.
 *
 *   Throws `StreamSequenceError` if the event's `number` is not the next
 *   sequential value for its partition (i.e. `currentMax + 1`, or `1` for
 *   an empty stream). The stream is strictly sequential with no gaps.
 *
 *   Throws `StreamSlotConflictError` if the
 *   `(registrationId, accreditationId, number)` slot is already occupied.
 * @property {(registrationId: string, accreditationId: string | null) => Promise<StreamEvent | null>} findLatestByPartition
 *   Return the highest-numbered event for the stream partition, or `null`
 *   if none exist.
 * @property {(registrationId: string, accreditationId: string | null, kind: import('./stream-schema.js').StreamEventKind) => Promise<StreamEvent | null>} findLatestByPartitionAndKind
 *   Return the highest-numbered event of the given kind for the stream
 *   partition, or `null` if none of that kind exist.
 * @property {(registrationId: string, accreditationId: string | null, prnId: string, afterNumber: number) => Promise<StreamEvent[]>} findEventsByPrnIdAfter
 *   Return events referencing the given `prnId` in `payload.prnId` within
 *   the specified partition, with `number > afterNumber`, ordered by
 *   `number` ascending.
 * @property {(registrationId: string, accreditationId: string | null) => Promise<StreamEvent[]>} findAllByPartition
 *   Return all events for the given partition, ordered by `number`
 *   ascending. Returns an empty array if the partition has no events.
 * @property {(registrationId: string, accreditationId: string | null) => Promise<number>} deleteByPartition
 *   Migration PAE-1382: delete all events for the given partition.
 *   Returns the number of deleted events. No-op on empty partition.
 * @property {(events: StreamEventInsert[]) => Promise<StreamEvent[]>} bulkAppendEvents
 *   Append a contiguous batch of events. Events must be numbered
 *   sequentially, and the first event's number must be `currentMax + 1`
 *   (or `1` if the partition is empty). Throws `StreamSlotConflictError` if
 *   the starting slot is already occupied, `StreamSequenceError` on a gap or
 *   non-sequential numbering. Empty array is a no-op.
 *
 *   Not isolated: the batch is not rolled back as a unit, so a later slot
 *   conflict leaves earlier inserts of the same batch committed. A multi-event
 *   batch is therefore only safe where nothing else writes the partition
 *   concurrently — a single-event command append or a single-threaded load.
 */

/**
 * @typedef {() => WasteBalanceStreamRepository} WasteBalanceStreamRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

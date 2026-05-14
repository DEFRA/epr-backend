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
 * Raised by `appendEvent` when the event's natural key already exists
 * in the stream — e.g. a duplicate `(registrationId, accreditationId, kind,
 * payload.summaryLogId)` or `(registrationId, accreditationId, kind,
 * payload.prnId)`. Distinct from slot conflict: the caller retried at a
 * new slot number but the event itself was already recorded.
 */
export class StreamIdempotencyConflictError extends Error {
  /** @type {import('./stream-schema.js').StreamEventKind} */
  kind
  /** @type {string} */
  naturalKey

  /**
   * @param {import('./stream-schema.js').StreamEventKind} kind
   * @param {string} naturalKey
   */
  constructor(kind, naturalKey) {
    super(
      `Stream idempotency conflict for kind ${kind} natural key ${naturalKey}`
    )
    this.name = 'StreamIdempotencyConflictError'
    this.kind = kind
    this.naturalKey = naturalKey
  }
}

/**
 * @typedef {import('./stream-schema.js').StreamEventInsert} StreamEventInsert
 */

/**
 * @typedef {import('./stream-schema.js').StreamEvent} StreamEvent
 */

/**
 * @typedef {Object} StreamRepository
 * @property {(event: StreamEventInsert) => Promise<StreamEvent>} appendEvent
 *   Persist a single event. Returns the stored event with its assigned `id`.
 *
 *   Throws `StreamSlotConflictError` if the
 *   `(registrationId, accreditationId, number)` slot is already occupied.
 *
 *   Throws `StreamIdempotencyConflictError` if the event's natural key
 *   already exists (e.g. duplicate `summaryLogId` or `prnId` within the
 *   same stream and kind).
 * @property {(registrationId: string, accreditationId: string | null) => Promise<StreamEvent | null>} findLatestByPartition
 *   Return the highest-numbered event for the stream partition, or `null`
 *   if none exist.
 * @property {(registrationId: string, accreditationId: string | null, kind: import('./stream-schema.js').StreamEventKind) => Promise<StreamEvent | null>} findLatestByPartitionAndKind
 *   Return the highest-numbered event of the given kind for the stream
 *   partition, or `null` if none of that kind exist.
 * @property {(prnId: string, afterNumber: number) => Promise<StreamEvent[]>} findEventsByPrnIdAfter
 *   Return events referencing the given `prnId` in `payload.prnId` with
 *   `number > afterNumber`, ordered by `number` ascending.
 * @property {(registrationId: string, accreditationId: string | null) => Promise<void>} deleteAllForPartition
 *   Remove every event belonging to the stream partition. Idempotent —
 *   resolves cleanly when no events exist.
 */

/**
 * @typedef {() => StreamRepository} StreamRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

import { randomUUID } from 'node:crypto'

import { STREAM_EVENT_KIND } from './stream-schema.js'
import {
  StreamSlotConflictError,
  StreamIdempotencyConflictError
} from './stream-port.js'
import { validateStreamEventInsert } from './stream-validation.js'

/**
 * In-memory adapter for the waste balance event stream.
 *
 * Backed by a single array — fine for tests, fixtures, and contract
 * verification. Not durable, not concurrent-safe across processes.
 */

/**
 * @typedef {import('./stream-schema.js').StreamEvent} StreamEvent
 */

/**
 * @typedef {import('./stream-schema.js').StreamEventInsert} StreamEventInsert
 */

const PRN_KINDS = new Set([
  STREAM_EVENT_KIND.PRN_CREATED,
  STREAM_EVENT_KIND.PRN_ISSUED,
  STREAM_EVENT_KIND.PRN_CREATION_CANCELLED,
  STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE
])

/**
 * @param {StreamEvent} event
 * @param {string} registrationId
 * @param {string | null} accreditationId
 */
const matchesPartition = (event, registrationId, accreditationId) =>
  event.registrationId === registrationId &&
  event.accreditationId === accreditationId

/**
 * @param {Array<StreamEvent>} [initialEvents]
 * @returns {import('./stream-port.js').StreamRepositoryFactory}
 */
export const createInMemoryStreamRepository = (initialEvents = []) => {
  const storage = initialEvents

  return () => ({
    /** @param {StreamEventInsert} event */
    appendEvent: async (event) => {
      const validated = validateStreamEventInsert(event)

      const slotTaken = storage.some(
        (existing) =>
          matchesPartition(
            existing,
            validated.registrationId,
            validated.accreditationId
          ) && existing.number === validated.number
      )

      if (slotTaken) {
        throw new StreamSlotConflictError(
          validated.registrationId,
          validated.accreditationId,
          validated.number
        )
      }

      if (validated.kind === STREAM_EVENT_KIND.SUMMARY_LOG_SUBMITTED) {
        const idempotencyConflict = storage.some(
          (existing) =>
            matchesPartition(
              existing,
              validated.registrationId,
              validated.accreditationId
            ) &&
            existing.kind === validated.kind &&
            /** @type {*} */ (existing.payload).summaryLogId ===
              /** @type {*} */ (validated.payload).summaryLogId
        )
        if (idempotencyConflict) {
          throw new StreamIdempotencyConflictError(
            validated.kind,
            /** @type {*} */ (validated.payload).summaryLogId
          )
        }
      } else if (PRN_KINDS.has(validated.kind)) {
        const idempotencyConflict = storage.some(
          (existing) =>
            matchesPartition(
              existing,
              validated.registrationId,
              validated.accreditationId
            ) &&
            existing.kind === validated.kind &&
            /** @type {*} */ (existing.payload).prnId ===
              /** @type {*} */ (validated.payload).prnId
        )
        if (idempotencyConflict) {
          throw new StreamIdempotencyConflictError(
            validated.kind,
            /** @type {*} */ (validated.payload).prnId
          )
        }
      }

      const persisted = { id: randomUUID(), ...validated }
      storage.push(persisted)
      return structuredClone(persisted)
    },

    /**
     * @param {string} registrationId
     * @param {string | null} accreditationId
     */
    findLatestByPartition: async (registrationId, accreditationId) => {
      const matches = storage.filter((event) =>
        matchesPartition(event, registrationId, accreditationId)
      )

      if (matches.length === 0) {
        return null
      }

      const latest = matches.reduce((highest, current) =>
        current.number > highest.number ? current : highest
      )

      return structuredClone(latest)
    },

    /**
     * @param {string} registrationId
     * @param {string | null} accreditationId
     * @param {import('./stream-schema.js').StreamEventKind} kind
     */
    findLatestByPartitionAndKind: async (
      registrationId,
      accreditationId,
      kind
    ) => {
      const matches = storage.filter(
        (event) =>
          matchesPartition(event, registrationId, accreditationId) &&
          event.kind === kind
      )

      if (matches.length === 0) {
        return null
      }

      const latest = matches.reduce((highest, current) =>
        current.number > highest.number ? current : highest
      )

      return structuredClone(latest)
    },

    /**
     * @param {string} prnId
     * @param {number} afterNumber
     */
    findEventsByPrnIdAfter: async (prnId, afterNumber) => {
      const matches = storage
        .filter(
          (event) =>
            /** @type {*} */ (event.payload).prnId === prnId &&
            event.number > afterNumber
        )
        .sort((a, b) => a.number - b.number)

      return structuredClone(matches)
    },

    /**
     * @param {string} registrationId
     * @param {string | null} accreditationId
     */
    deleteAllForPartition: async (registrationId, accreditationId) => {
      for (let index = storage.length - 1; index >= 0; index -= 1) {
        if (matchesPartition(storage[index], registrationId, accreditationId)) {
          storage.splice(index, 1)
        }
      }
    }
  })
}

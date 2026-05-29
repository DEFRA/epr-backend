import { randomUUID } from 'node:crypto'

import { StreamSlotConflictError, StreamSequenceError } from './stream-port.js'
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

/**
 * @param {StreamEvent} event
 * @param {string} registrationId
 * @param {string | null} accreditationId
 */
const matchesPartition = (event, registrationId, accreditationId) =>
  (registrationId === undefined ||
    event.registrationId === registrationId) &&
  event.accreditationId === accreditationId

/**
 * Validates and appends an event to the in-memory storage.
 *
 * @param {StreamEvent[]} storage
 * @param {StreamEventInsert} event
 * @returns {StreamEvent}
 */
const doAppend = (storage, event) => {
  const validated = validateStreamEventInsert(event)

  const partitionEvents = storage.filter((existing) =>
    matchesPartition(
      existing,
      validated.registrationId,
      validated.accreditationId
    )
  )

  const currentMax =
    partitionEvents.length > 0
      ? /** @type {StreamEvent} */ (partitionEvents.at(-1)).number
      : 0
  const expectedNumber = currentMax + 1

  if (validated.number !== expectedNumber) {
    if (partitionEvents.some((e) => e.number === validated.number)) {
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

  const persisted = { id: randomUUID(), ...validated }
  storage.push(persisted)
  return structuredClone(persisted)
}

/**
 * Migration PAE-1382: delete all events for a partition.
 *
 * @param {StreamEvent[]} storage
 * @param {string} registrationId
 * @param {string | null} accreditationId
 * @returns {number}
 */
const doDeleteByPartition = (storage, registrationId, accreditationId) => {
  const before = storage.length
  const remaining = storage.filter(
    (event) => !matchesPartition(event, registrationId, accreditationId)
  )
  storage.length = 0
  storage.push(...remaining)
  return before - remaining.length
}

/**
 * Migration PAE-1382: insert multiple events in one call.
 *
 * @param {StreamEvent[]} storage
 * @param {StreamEventInsert[]} events
 * @returns {StreamEvent[]}
 */
const doBulkAppend = (storage, events) => {
  if (events.length === 0) {
    return []
  }

  const first = events[0]
  const partitionEvents = storage.filter((existing) =>
    matchesPartition(existing, first.registrationId, first.accreditationId)
  )
  const currentMax =
    partitionEvents.length > 0
      ? /** @type {StreamEvent} */ (partitionEvents.at(-1)).number
      : 0

  const expectedStart = currentMax + 1

  if (first.number !== expectedStart) {
    throw new StreamSequenceError(
      first.registrationId,
      first.accreditationId,
      first.number,
      expectedStart
    )
  }

  for (let i = 1; i < events.length; i++) {
    const expected = first.number + i
    if (events[i].number !== expected) {
      throw new StreamSequenceError(
        events[i].registrationId,
        events[i].accreditationId,
        events[i].number,
        expected
      )
    }
  }

  return events.map((event) => {
    const validated = validateStreamEventInsert(event)
    const persisted = { id: randomUUID(), ...validated }
    storage.push(persisted)
    return structuredClone(persisted)
  })
}

/**
 * @param {Array<StreamEvent>} [initialEvents]
 * @returns {import('./stream-port.js').WasteBalanceStreamRepositoryFactory}
 */
export const createInMemoryStreamRepository = (initialEvents = []) => {
  const storage = initialEvents

  return () => ({
    /** @param {StreamEventInsert} event */
    appendEvent: async (event) => doAppend(storage, event),

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

      return structuredClone(/** @type {StreamEvent} */ (matches.at(-1)))
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

      return structuredClone(/** @type {StreamEvent} */ (matches.at(-1)))
    },

    /**
     * @param {string} registrationId
     * @param {string | null} accreditationId
     * @param {string} prnId
     * @param {number} afterNumber
     */
    findEventsByPrnIdAfter: async (
      registrationId,
      accreditationId,
      prnId,
      afterNumber
    ) => {
      const matches = storage
        .filter(
          (event) =>
            matchesPartition(event, registrationId, accreditationId) &&
            /** @type {*} */ (event.payload).prnId === prnId &&
            event.number > afterNumber
        )
        .sort((a, b) => a.number - b.number)

      return structuredClone(matches)
    },

    deleteByPartition: async (registrationId, accreditationId) =>
      doDeleteByPartition(storage, registrationId, accreditationId),

    bulkAppendEvents: async (events) => doBulkAppend(storage, events)
  })
}

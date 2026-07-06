import { randomUUID } from 'node:crypto'

import { LedgerSlotConflictError, LedgerSequenceError } from './ledger-port.js'
import { validateStreamEventInsert } from './ledger-validation.js'

/**
 * In-memory adapter for the waste balance event ledger.
 *
 * Backed by a single array — fine for tests, fixtures, and contract
 * verification. Not durable, not concurrent-safe across processes.
 */

/**
 * @typedef {import('./ledger-schema.js').LedgerEvent} LedgerEvent
 */

/**
 * @typedef {import('./ledger-schema.js').LedgerEventInsert} LedgerEventInsert
 */

/**
 * @param {LedgerEvent} event
 * @param {string} registrationId
 * @param {string | null} accreditationId
 */
const matchesLedger = (event, registrationId, accreditationId) =>
  event.registrationId === registrationId &&
  event.accreditationId === accreditationId

/**
 * Migration PAE-1382: delete all events for a ledgerId.
 *
 * @param {LedgerEvent[]} storage
 * @param {string} registrationId
 * @param {string | null} accreditationId
 * @returns {number}
 */
const doDeleteInLedger = (storage, registrationId, accreditationId) => {
  const before = storage.length
  const remaining = storage.filter(
    (event) => !matchesLedger(event, registrationId, accreditationId)
  )
  storage.length = 0
  storage.push(...remaining)
  return before - remaining.length
}

/**
 * Append a contiguous batch of events. Synchronous and validated up front, so
 * the whole batch applies or none of it does.
 *
 * @param {LedgerEvent[]} storage
 * @param {LedgerEventInsert[]} events
 * @returns {LedgerEvent[]}
 */
const doAppendEvents = (storage, events) => {
  if (events.length === 0) {
    return []
  }

  const first = events[0]
  const ledgerEvents = storage.filter((existing) =>
    matchesLedger(existing, first.registrationId, first.accreditationId)
  )
  const currentMax =
    ledgerEvents.length > 0
      ? /** @type {LedgerEvent} */ (ledgerEvents.at(-1)).number
      : 0

  const expectedStart = currentMax + 1

  if (first.number !== expectedStart) {
    if (ledgerEvents.some((e) => e.number === first.number)) {
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

  for (let i = 1; i < events.length; i++) {
    const expected = first.number + i
    if (events[i].number !== expected) {
      throw new LedgerSequenceError(
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
 * @param {Array<LedgerEvent>} [initialEvents]
 * @returns {import('./ledger-port.js').WasteBalanceLedgerRepositoryFactory}
 */
export const createInMemoryLedgerRepository = (initialEvents = []) => {
  const storage = initialEvents

  return () => ({
    /**
     * @param {string} registrationId
     * @param {string | null} accreditationId
     */
    findLatestInLedger: async (registrationId, accreditationId) => {
      const matches = storage.filter((event) =>
        matchesLedger(event, registrationId, accreditationId)
      )

      if (matches.length === 0) {
        return null
      }

      return structuredClone(/** @type {LedgerEvent} */ (matches.at(-1)))
    },

    /**
     * @param {string} registrationId
     * @param {string | null} accreditationId
     * @param {import('./ledger-schema.js').LedgerEventKind} kind
     */
    findLatestInLedgerByKind: async (registrationId, accreditationId, kind) => {
      const matches = storage.filter(
        (event) =>
          matchesLedger(event, registrationId, accreditationId) &&
          event.kind === kind
      )

      if (matches.length === 0) {
        return null
      }

      return structuredClone(/** @type {LedgerEvent} */ (matches.at(-1)))
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
            matchesLedger(event, registrationId, accreditationId) &&
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
    findAllInLedger: async (registrationId, accreditationId) => {
      const matches = storage
        .filter((event) =>
          matchesLedger(event, registrationId, accreditationId)
        )
        .sort((a, b) => a.number - b.number)

      return structuredClone(matches)
    },

    deleteAllInLedger: async (registrationId, accreditationId) =>
      doDeleteInLedger(storage, registrationId, accreditationId),

    appendEvents: async (events) => doAppendEvents(storage, events)
  })
}

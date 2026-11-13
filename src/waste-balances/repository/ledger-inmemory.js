import { LedgerSlotConflictError, LedgerSequenceError } from './ledger-port.js'
import {
  LEDGER_EVENT_KIND,
  isSameLedger,
  ledgerKey,
  pickLedgerId
} from './ledger-schema.js'
import { validateLedgerEventInsert } from './ledger-validation.js'

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
 * @typedef {import('./ledger-schema.js').WasteBalanceLedgerId} WasteBalanceLedgerId
 */

/**
 * Migration PAE-1382: delete all events for a ledgerId.
 *
 * @param {LedgerEvent[]} storage
 * @param {WasteBalanceLedgerId} ledgerId
 * @returns {number}
 */
const doDeleteInLedger = (storage, ledgerId) => {
  const before = storage.length
  const remaining = storage.filter((event) => !isSameLedger(event, ledgerId))
  storage.length = 0
  storage.push(...remaining)
  return before - remaining.length
}

/**
 * One entry per ledger partition with a submitted summary log, carrying the
 * `summaryLogId` of its highest-numbered submission.
 *
 * @param {LedgerEvent[]} storage
 * @returns {import('./ledger-port.js').LatestSubmittedSummaryLogPerLedger[]}
 */
const doFindLatestSubmittedSummaryLogPerLedger = (storage) => {
  /** @type {Map<string, LedgerEvent>} */
  const latestByPartition = new Map()

  for (const event of storage) {
    if (event.kind !== LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED) {
      continue
    }

    const key = ledgerKey(event)
    const latest = latestByPartition.get(key)
    if (!latest || event.number > latest.number) {
      latestByPartition.set(key, event)
    }
  }

  return [...latestByPartition.values()].map((event) => ({
    ledgerId: pickLedgerId(event),
    summaryLogId: /** @type {*} */ (event.payload).summaryLogId
  }))
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
    isSameLedger(existing, first)
  )
  const currentMax =
    ledgerEvents.length > 0
      ? /** @type {LedgerEvent} */ (ledgerEvents.at(-1)).number
      : 0

  const expectedStart = currentMax + 1

  if (first.number !== expectedStart) {
    if (ledgerEvents.some((e) => e.number === first.number)) {
      throw new LedgerSlotConflictError(first)
    }
    throw new LedgerSequenceError(first, expectedStart)
  }

  for (let i = 1; i < events.length; i++) {
    const expected = first.number + i
    if (events[i].number !== expected) {
      throw new LedgerSequenceError(events[i], expected)
    }
  }

  return events.map((event) => {
    const validated = validateLedgerEventInsert(event)
    storage.push(validated)
    return structuredClone(validated)
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
     * @param {WasteBalanceLedgerId} ledgerId
     */
    findLatestInLedger: async (ledgerId) => {
      const matches = storage.filter((event) => isSameLedger(event, ledgerId))

      if (matches.length === 0) {
        return null
      }

      return structuredClone(/** @type {LedgerEvent} */ (matches.at(-1)))
    },

    /**
     * @param {WasteBalanceLedgerId[]} ledgerIds
     */
    findLatestInLedgers: async (ledgerIds) =>
      ledgerIds.flatMap((ledgerId) => {
        const latest = storage
          .filter((event) => isSameLedger(event, ledgerId))
          .at(-1)
        return latest ? [structuredClone(latest)] : []
      }),

    /**
     * @param {WasteBalanceLedgerId} ledgerId
     * @param {import('./ledger-schema.js').LedgerEventKind} kind
     */
    findLatestInLedgerByKind: async (ledgerId, kind) => {
      const matches = storage.filter(
        (event) => isSameLedger(event, ledgerId) && event.kind === kind
      )

      if (matches.length === 0) {
        return null
      }

      return structuredClone(/** @type {LedgerEvent} */ (matches.at(-1)))
    },

    /**
     * @param {WasteBalanceLedgerId} ledgerId
     * @param {string} prnId
     * @param {number} afterNumber
     */
    findEventsByPrnIdAfter: async (ledgerId, prnId, afterNumber) => {
      const matches = storage
        .filter(
          (event) =>
            isSameLedger(event, ledgerId) &&
            /** @type {*} */ (event.payload).prnId === prnId &&
            event.number > afterNumber
        )
        .sort((a, b) => a.number - b.number)

      return structuredClone(matches)
    },

    /**
     * @param {WasteBalanceLedgerId} ledgerId
     */
    findAllInLedger: async (ledgerId) => {
      const matches = storage
        .filter((event) => isSameLedger(event, ledgerId))
        .sort((a, b) => a.number - b.number)

      return structuredClone(matches)
    },

    findLatestSubmittedSummaryLogPerLedger: async () =>
      doFindLatestSubmittedSummaryLogPerLedger(storage),

    /**
     * @param {WasteBalanceLedgerId} ledgerId
     */
    deleteAllInLedger: async (ledgerId) => doDeleteInLedger(storage, ledgerId),

    appendEvents: async (events) => doAppendEvents(storage, events)
  })
}

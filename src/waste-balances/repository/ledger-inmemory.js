import { randomUUID } from 'node:crypto'

import { LedgerSlotConflictError } from './ledger-port.js'
import { LEDGER_SOURCE_KIND } from './ledger-schema.js'
import { validateLedgerTransactionInsert } from './ledger-validation.js'

/**
 * In-memory adapter for the waste balance ledger.
 *
 * Backed by a single array — fine for tests, fixtures, and contract
 * verification. Not durable, not concurrent-safe across processes.
 */

/**
 * @typedef {import('./ledger-port.js').LedgerTransaction} LedgerTransaction
 */

/**
 * @typedef {import('./ledger-schema.js').LedgerTransactionInsert} LedgerTransactionInsert
 */

/**
 * Stable map key for a waste record `(type, rowId)`. Private to this
 * adapter — Maps need primitive-or-reference equality, so we synthesise a
 * string for lookup. Never persisted.
 *
 * @param {{ type: string, rowId: string }} record
 */
const wasteRecordKey = ({ type, rowId }) => `${type}:${rowId}`

/**
 * @param {Array<LedgerTransaction>} [initialTransactions]
 * @returns {import('./ledger-port.js').LedgerRepositoryFactory}
 */
export const createInMemoryLedgerRepository = (initialTransactions = []) => {
  const storage = initialTransactions

  /**
   * @param {Array<LedgerTransaction>} haystack
   * @param {string} accreditationId
   * @param {number} number
   */
  const slotTakenIn = (haystack, accreditationId, number) =>
    haystack.some(
      (existing) =>
        existing.accreditationId === accreditationId &&
        existing.number === number
    )

  return () => ({
    /** @param {LedgerTransactionInsert[]} transactions */
    insertTransactions: async (transactions) => {
      /** @type {LedgerTransaction[]} */
      const stored = []

      for (const transaction of transactions) {
        const validated = validateLedgerTransactionInsert(transaction)

        if (slotTakenIn(storage, validated.accreditationId, validated.number)) {
          throw new LedgerSlotConflictError(
            validated.accreditationId,
            validated.number
          )
        }

        const persisted = { id: randomUUID(), ...validated }
        storage.push(persisted)
        stored.push(structuredClone(persisted))
      }

      return stored
    },
    /** @param {string} accreditationId */
    findLatestByAccreditationId: async (accreditationId) => {
      const matches = storage.filter(
        (existing) => existing.accreditationId === accreditationId
      )

      const [first, ...rest] = matches

      if (!first) {
        return null
      }

      const latest = rest.reduce(
        (highest, current) =>
          current.number > highest.number ? current : highest,
        first
      )

      return structuredClone(latest)
    },
    /**
     * @param {string} accreditationId
     * @param {Array<{ type: string, rowId: string }>} wasteRecords
     * @returns {Promise<import('./ledger-port.js').CreditedAmountLookup>}
     */
    findLatestCreditedAmountsByWasteRecords: async (
      accreditationId,
      wasteRecords
    ) => {
      const requested = new Set(wasteRecords.map(wasteRecordKey))
      const latestByKey = new Map()

      for (const transaction of storage) {
        if (
          transaction.accreditationId !== accreditationId ||
          transaction.source?.kind !== LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW
        ) {
          continue
        }

        const key = wasteRecordKey(transaction.source.summaryLogRow.wasteRecord)
        if (!requested.has(key)) {
          continue
        }

        const existing = latestByKey.get(key)
        if (!existing || transaction.number > existing.number) {
          latestByKey.set(key, transaction)
        }
      }

      return (record) => {
        const found = latestByKey.get(wasteRecordKey(record))
        return found ? found.source.summaryLogRow.wasteRecord.creditedAmount : 0
      }
    }
  })
}

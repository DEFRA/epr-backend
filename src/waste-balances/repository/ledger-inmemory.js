import { randomUUID } from 'node:crypto'

import { LedgerSlotConflictError } from './ledger-port.js'
import { LEDGER_SOURCE_KIND, LEDGER_TRANSACTION_TYPE } from './ledger-schema.js'
import { validateLedgerTransactionInsert } from './ledger-validation.js'
import { add, toNumber } from '#common/helpers/decimal-utils.js'

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
    /** @param {string[]} wasteRecordIds */
    findCreditedAmountsByWasteRecordIds: async (wasteRecordIds) => {
      const totals = new Map()
      for (const id of wasteRecordIds) {
        totals.set(id, 0)
      }

      if (totals.size === 0) {
        return totals
      }

      for (const transaction of storage) {
        if (transaction.source?.kind !== LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW) {
          continue
        }

        const wasteRecordId = transaction.source.summaryLogRow?.wasteRecordId
        if (!totals.has(wasteRecordId)) {
          continue
        }

        const sign =
          transaction.type === LEDGER_TRANSACTION_TYPE.CREDIT ? 1 : -1
        const signedAmount =
          sign === 1 ? transaction.amount : -transaction.amount
        totals.set(
          wasteRecordId,
          toNumber(add(totals.get(wasteRecordId), signedAmount))
        )
      }

      return totals
    }
  })
}

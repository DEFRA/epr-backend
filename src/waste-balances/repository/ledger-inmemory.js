import { randomUUID } from 'node:crypto'

import { LedgerSlotConflictError } from './ledger-port.js'
import { validateLedgerTransactionInsert } from './ledger-validation.js'

/**
 * In-memory adapter for the waste balance ledger.
 *
 * Backed by a single array — fine for tests, fixtures, and contract
 * verification. Not durable, not concurrent-safe across processes.
 */

/**
 * @param {Array<import('./ledger-port.js').LedgerTransaction>} [initialTransactions]
 * @returns {import('./ledger-port.js').LedgerRepositoryFactory}
 */
export const createInMemoryLedgerRepository = (initialTransactions = []) => {
  const storage = initialTransactions

  const slotTakenIn = (haystack, accreditationId, number) =>
    haystack.some(
      (existing) =>
        existing.accreditationId === accreditationId &&
        existing.number === number
    )

  return () => ({
    insertTransactions: async (transactions) => {
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
    }
  })
}

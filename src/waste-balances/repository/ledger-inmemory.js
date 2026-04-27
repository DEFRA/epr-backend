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

  return () => ({
    insertTransaction: async (transaction) => {
      const validated = validateLedgerTransactionInsert(transaction)

      const slotTaken = storage.some(
        (existing) =>
          existing.accreditationId === validated.accreditationId &&
          existing.number === validated.number
      )

      if (slotTaken) {
        throw new LedgerSlotConflictError(
          validated.accreditationId,
          validated.number
        )
      }

      const stored = { id: randomUUID(), ...validated }
      storage.push(stored)
      return structuredClone(stored)
    },
    findLatestByAccreditationId: async (accreditationId) => {
      const matches = storage.filter(
        (existing) => existing.accreditationId === accreditationId
      )

      if (matches.length === 0) {
        return null
      }

      const latest = matches.reduce((highest, current) =>
        current.number > highest.number ? current : highest
      )

      return structuredClone(latest)
    }
  })
}

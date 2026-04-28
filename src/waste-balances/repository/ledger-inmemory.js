import { randomUUID } from 'node:crypto'

import { LedgerSlotConflictError } from './ledger-port.js'
import { LEDGER_SOURCE_KIND, LEDGER_TRANSACTION_TYPE } from './ledger-schema.js'
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

const byNumberAscending = (a, b) => a.number - b.number

/**
 * @param {LedgerTransaction} transaction
 */
const summaryLogRowOf = (transaction) =>
  transaction.source.kind === LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW
    ? transaction.source.summaryLogRow
    : null

/**
 * @param {LedgerTransaction} transaction
 */
const prnOperationOf = (transaction) =>
  transaction.source.kind === LEDGER_SOURCE_KIND.PRN_OPERATION
    ? transaction.source.prnOperation
    : null

/**
 * @param {LedgerTransaction} transaction
 */
const signedAmount = (transaction) => {
  if (transaction.type === LEDGER_TRANSACTION_TYPE.CREDIT) {
    return transaction.amount
  }
  if (transaction.type === LEDGER_TRANSACTION_TYPE.DEBIT) {
    return -transaction.amount
  }
  return 0
}

/**
 * @param {LedgerTransaction[]} transactions
 */
const latestPerAccreditationFrom = (transactions) => {
  const byAccreditation = new Map()
  for (const transaction of transactions) {
    const existing = byAccreditation.get(transaction.accreditationId)
    if (!existing || transaction.number > existing.number) {
      byAccreditation.set(transaction.accreditationId, transaction)
    }
  }
  return Array.from(byAccreditation.values()).map((transaction) =>
    structuredClone(transaction)
  )
}

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

  const findOrdered = (predicate) =>
    storage
      .filter(predicate)
      .sort(byNumberAscending)
      .map((transaction) => structuredClone(transaction))

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

    /** @param {string} summaryLogId */
    findTransactionsBySummaryLogId: async (summaryLogId) =>
      findOrdered((transaction) => {
        const row = summaryLogRowOf(transaction)
        return row !== null && row.summaryLogId === summaryLogId
      }),

    /** @param {string} wasteRecordId */
    findTransactionsByWasteRecordId: async (wasteRecordId) =>
      findOrdered((transaction) => {
        const row = summaryLogRowOf(transaction)
        return row !== null && row.wasteRecordId === wasteRecordId
      }),

    /** @param {string} prnId */
    findTransactionsByPrnId: async (prnId) =>
      findOrdered((transaction) => {
        const operation = prnOperationOf(transaction)
        return operation !== null && operation.prnId === prnId
      }),

    /** @param {{ summaryLogId: string, rowId: string, rowType: string }} key */
    findTransactionsByRow: async ({ summaryLogId, rowId, rowType }) =>
      findOrdered((transaction) => {
        const row = summaryLogRowOf(transaction)
        return (
          row !== null &&
          row.summaryLogId === summaryLogId &&
          row.rowId === rowId &&
          row.rowType === rowType
        )
      }),

    /** @param {string[]} wasteRecordIds */
    findCreditedAmountsByWasteRecordIds: async (wasteRecordIds) => {
      const result = new Map(wasteRecordIds.map((id) => [id, 0]))
      for (const transaction of storage) {
        const row = summaryLogRowOf(transaction)
        if (row === null) {
          continue
        }
        const current = result.get(row.wasteRecordId)
        if (current === undefined) {
          continue
        }
        result.set(row.wasteRecordId, current + signedAmount(transaction))
      }
      return result
    },

    /** @param {string} organisationId */
    findLatestPerAccreditationByOrganisationId: async (organisationId) =>
      latestPerAccreditationFrom(
        storage.filter(
          (transaction) => transaction.organisationId === organisationId
        )
      ),

    /** @param {string} registrationId */
    findLatestPerAccreditationByRegistrationId: async (registrationId) =>
      latestPerAccreditationFrom(
        storage.filter(
          (transaction) => transaction.registrationId === registrationId
        )
      )
  })
}

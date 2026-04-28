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
 * @param {LedgerTransaction[]} storage
 * @param {string} accreditationId
 * @param {number} number
 */
const slotTakenIn = (storage, accreditationId, number) =>
  storage.some(
    (existing) =>
      existing.accreditationId === accreditationId && existing.number === number
  )

/**
 * @param {LedgerTransaction[]} storage
 * @returns {(transactions: LedgerTransactionInsert[]) => Promise<LedgerTransaction[]>}
 */
const performInsertTransactions = (storage) => async (transactions) => {
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
}

/**
 * @param {LedgerTransaction[]} storage
 * @returns {(accreditationId: string) => Promise<LedgerTransaction | null>}
 */
const performFindLatestByAccreditationId =
  (storage) => async (accreditationId) => {
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

/**
 * @param {LedgerTransaction[]} storage
 * @returns {(wasteRecordIds: string[]) => Promise<Map<string, number>>}
 */
const performFindCreditedAmountsByWasteRecordIds =
  (storage) => async (wasteRecordIds) => {
    const result = new Map(wasteRecordIds.map((id) => [id, 0]))
    for (const transaction of storage) {
      const row = summaryLogRowOf(transaction)
      const current = row ? result.get(row.wasteRecordId) : undefined
      if (current !== undefined && row) {
        result.set(row.wasteRecordId, current + signedAmount(transaction))
      }
    }
    return result
  }

/**
 * @param {Array<LedgerTransaction>} [initialTransactions]
 * @returns {import('./ledger-port.js').LedgerRepositoryFactory}
 */
export const createInMemoryLedgerRepository = (initialTransactions = []) => {
  const storage = initialTransactions

  return () => ({
    insertTransactions: performInsertTransactions(storage),

    findLatestByAccreditationId: performFindLatestByAccreditationId(storage),

    findCreditedAmountsByWasteRecordIds:
      performFindCreditedAmountsByWasteRecordIds(storage),

    findLatestPerAccreditationByOrganisationId: async (organisationId) =>
      latestPerAccreditationFrom(
        storage.filter(
          (transaction) => transaction.organisationId === organisationId
        )
      ),

    findLatestPerAccreditationByRegistrationId: async (registrationId) =>
      latestPerAccreditationFrom(
        storage.filter(
          (transaction) => transaction.registrationId === registrationId
        )
      )
  })
}

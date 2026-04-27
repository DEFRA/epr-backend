/**
 * Storage-level port for the waste balance ledger.
 *
 * Surface is deliberately minimal: only primitives where two correct adapters
 * could meaningfully implement things differently (persistence, native conflict
 * signal translation). Domain logic — opening/closing arithmetic, retry on
 * slot conflict, builder-callback semantics — lives above the port in
 * `appendToLedger`, not on adapters.
 */

/**
 * Raised by `insertTransaction` when the `(accreditationId, number)` slot is
 * already occupied. Adapters translate their native conflict signal
 * (MongoDB `E11000`, in-memory index check) into this typed error so callers
 * can react uniformly.
 */
export class LedgerSlotConflictError extends Error {
  /**
   * @param {string} accreditationId
   * @param {number} number
   */
  constructor(accreditationId, number) {
    super(
      `Ledger slot already occupied for accreditation ${accreditationId} number ${number}`
    )
    this.name = 'LedgerSlotConflictError'
    this.accreditationId = accreditationId
    this.number = number
  }
}

/**
 * @typedef {import('./ledger-schema.js').LedgerTransactionInsert} LedgerTransactionInsert
 */

/**
 * @typedef {import('./ledger-schema.js').LedgerTransaction} LedgerTransaction
 */

/**
 * @typedef {Object} LedgerRepository
 * @property {(transaction: LedgerTransactionInsert) => Promise<LedgerTransaction>} insertTransaction
 *   Persist a transaction. Throws `LedgerSlotConflictError` if the
 *   `(accreditationId, number)` slot is already occupied. Returns the stored
 *   transaction with its assigned `id`.
 * @property {(accreditationId: string) => Promise<LedgerTransaction | null>} findLatestByAccreditationId
 *   Return the highest-numbered transaction for the accreditation, or `null`
 *   if none exist.
 */

/**
 * @typedef {() => LedgerRepository} LedgerRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

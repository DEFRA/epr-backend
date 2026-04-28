/**
 * Storage-level port for the waste balance ledger.
 *
 * Surface is deliberately minimal: only primitives where two correct adapters
 * could meaningfully implement things differently (persistence, native conflict
 * signal translation). Domain logic — balance arithmetic, retry on
 * slot conflict, builder-callback semantics — lives above the port in
 * `appendBatchToLedger`, not on adapters.
 */

/**
 * Raised by `insertTransactions` when an `(accreditationId, number)` slot
 * is already occupied. Adapters translate their native conflict signal
 * (MongoDB `E11000` from a `BulkWriteError`, in-memory index check) into this
 * typed error so callers can react uniformly.
 */
export class LedgerSlotConflictError extends Error {
  /** @type {string} */
  accreditationId
  /** @type {number} */
  slotNumber

  /**
   * @param {string} accreditationId
   * @param {number} slotNumber
   */
  constructor(accreditationId, slotNumber) {
    super(
      `Ledger slot already occupied for accreditation ${accreditationId} number ${slotNumber}`
    )
    this.name = 'LedgerSlotConflictError'
    this.accreditationId = accreditationId
    this.slotNumber = slotNumber
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
 * @property {(transactions: LedgerTransactionInsert[]) => Promise<LedgerTransaction[]>} insertTransactions
 *   Persist a batch of transactions in input order. Returns the stored
 *   transactions with their assigned `id`s in the same order.
 *
 *   Empty input is a no-op and resolves to an empty array.
 *
 *   Throws `LedgerSlotConflictError` if any
 *   `(accreditationId, number)` slot in the batch is already occupied or
 *   collides with another row in the same batch. The error carries the
 *   colliding `accreditationId` and `slotNumber`.
 *
 *   Insert is ordered: if a conflict aborts the batch mid-way, rows that
 *   landed before the conflict remain persisted. This is acceptable under the
 *   per-row delta-reconciliation invariant (ADR 0031): a re-upload converges
 *   from any partial state.
 * @property {(accreditationId: string) => Promise<LedgerTransaction | null>} findLatestByAccreditationId
 *   Return the highest-numbered transaction for the accreditation, or `null`
 *   if none exist.
 */

/**
 * @typedef {() => LedgerRepository} LedgerRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

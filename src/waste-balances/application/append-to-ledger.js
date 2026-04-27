import { LedgerSlotConflictError } from '../repository/ledger-port.js'

export const MAX_LEDGER_APPEND_RETRIES = 10

const ZERO_LATEST = Object.freeze({
  number: 0,
  closing: Object.freeze({ amount: 0, availableAmount: 0 })
})

/**
 * Raised by `appendToLedger` after the slot-conflict retry budget is
 * exhausted. Indicates persistent contention rather than a permanent fault;
 * callers can surface this as a retryable 5xx so the originating client can
 * retry the request.
 */
export class LedgerContentionError extends Error {
  /** @type {string} */
  accreditationId
  /** @type {number} */
  attempts

  /**
   * @param {string} accreditationId
   * @param {number} attempts
   */
  constructor(accreditationId, attempts) {
    super(
      `Failed to append ledger transaction for accreditation ${accreditationId} after ${attempts} attempts`
    )
    this.name = 'LedgerContentionError'
    this.accreditationId = accreditationId
    this.attempts = attempts
  }
}

/**
 * @param {import('../repository/ledger-port.js').LedgerTransaction | null} latest
 * @returns {{ number: number, closing: import('../repository/ledger-schema.js').LedgerBalanceSnapshot }}
 */
const summariseLatest = (latest) => {
  if (latest === null) {
    return ZERO_LATEST
  }

  return {
    number: latest.number,
    closing: {
      amount: latest.closing.amount,
      availableAmount: latest.closing.availableAmount
    }
  }
}

/**
 * Append a transaction to the waste balance ledger.
 *
 * Performs a read → builder → insert cycle so that the next sequential
 * `number` is always relative to the freshest observed `latest` snapshot,
 * and bounded-retries on `LedgerSlotConflictError` so concurrent writers
 * race for the slot rather than overwriting each other's totals.
 *
 * Builder receives `{ number, closing: { amount, availableAmount } }` (zeros
 * when the accreditation has no prior transactions) and returns the
 * transaction-specific fields — `type`, `amount`, `opening`, `closing`,
 * `source`, `createdBy`, `createdAt`. The builder is the single seat of
 * domain logic that knows whether a given transaction type moves both
 * balances (credit/debit) or only the available balance (pending_debit).
 *
 * Retry policy: at most `MAX_LEDGER_APPEND_RETRIES` (10) attempts, no
 * backoff. Slot contention resolves in microseconds — a unique-index
 * conflict means another writer claimed `number = N`, so the next attempt
 * re-reads `latest`, computes `N+1`, and tries again. Exponential backoff
 * would add latency without benefit. On exhaustion this raises
 * `LedgerContentionError` so the caller can surface a retryable 5xx.
 *
 * @param {{
 *   repository: import('../repository/ledger-port.js').LedgerRepository,
 *   accreditationId: string,
 *   organisationId: string,
 *   registrationId: string
 * }} context
 * @param {(latest: { number: number, closing: import('../repository/ledger-schema.js').LedgerBalanceSnapshot }) =>
 *   Omit<import('../repository/ledger-schema.js').LedgerTransactionInsert,
 *     'accreditationId' | 'organisationId' | 'registrationId' | 'number'>
 * } builder
 * @returns {Promise<import('../repository/ledger-port.js').LedgerTransaction>}
 */
export const appendToLedger = async (
  { repository, accreditationId, organisationId, registrationId },
  builder
) => {
  for (let attempt = 1; attempt <= MAX_LEDGER_APPEND_RETRIES; attempt += 1) {
    const latest = summariseLatest(
      await repository.findLatestByAccreditationId(accreditationId)
    )

    const fields = builder(latest)

    try {
      return await repository.insertTransaction({
        ...fields,
        // identity fields override builder output by design — see the
        // `ignores builder-returned …` test in append-to-ledger.test.js
        accreditationId,
        organisationId,
        registrationId,
        number: latest.number + 1
      })
    } catch (error) {
      if (!(error instanceof LedgerSlotConflictError)) {
        throw error
      }
    }
  }

  throw new LedgerContentionError(accreditationId, MAX_LEDGER_APPEND_RETRIES)
}

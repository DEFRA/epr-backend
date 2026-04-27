const ZERO_LATEST = Object.freeze({
  number: 0,
  closingBalance: Object.freeze({ amount: 0, availableAmount: 0 })
})

/**
 * @param {import('../repository/ledger-port.js').LedgerTransaction | null} latest
 * @returns {{ number: number, closingBalance: import('../repository/ledger-schema.js').LedgerBalanceSnapshot }}
 */
const summariseLatest = (latest) => {
  if (latest === null) {
    return ZERO_LATEST
  }

  return {
    number: latest.number,
    closingBalance: {
      amount: latest.closingBalance.amount,
      availableAmount: latest.closingBalance.availableAmount
    }
  }
}

/**
 * Append a transaction to the waste balance ledger.
 *
 * Reads the latest transaction once, hands it to the builder so the new
 * `opening`/`closing` totals chain off the freshest observed snapshot, and
 * inserts at `latest.number + 1`. A `LedgerSlotConflictError` from the
 * insert (another writer claimed the slot) propagates straight to the
 * caller — recovery is the caller's responsibility:
 *
 * - Summary-log row writes recover via operator re-upload, which is
 *   already idempotent under the per-row delta-reconciliation invariant
 *   (ADR 0031 "Per-row delta reconciliation"). A re-upload converges
 *   regardless of which rows landed on the failed attempt.
 * - PRN operations are single-row writes whose handlers can surface a
 *   retryable 5xx so the originating client re-issues the operation.
 *
 * Surfacing slot conflicts rather than retrying inside the primitive
 * keeps every conflict diagnostically visible and avoids hiding any
 * future writer-interleaving we'd want to know about.
 *
 * @param {{
 *   repository: import('../repository/ledger-port.js').LedgerRepository,
 *   accreditationId: string,
 *   organisationId: string,
 *   registrationId: string
 * }} context
 * @param {(latest: { number: number, closingBalance: import('../repository/ledger-schema.js').LedgerBalanceSnapshot }) =>
 *   Omit<import('../repository/ledger-schema.js').LedgerTransactionInsert,
 *     'accreditationId' | 'organisationId' | 'registrationId' | 'number'>
 * } builder
 * @returns {Promise<import('../repository/ledger-port.js').LedgerTransaction>}
 */
export const appendToLedger = async (
  { repository, accreditationId, organisationId, registrationId },
  builder
) => {
  const latest = summariseLatest(
    await repository.findLatestByAccreditationId(accreditationId)
  )

  const fields = builder(latest)

  return repository.insertTransaction({
    ...fields,
    accreditationId,
    organisationId,
    registrationId,
    number: latest.number + 1
  })
}

const ZERO_LATEST = Object.freeze({
  number: 0,
  closingBalance: Object.freeze({ amount: 0, availableAmount: 0 })
})

/**
 * @param {import('../repository/ledger-port.js').LedgerTransaction | null} latest
 * @returns {{ number: number, closingBalance: import('../repository/ledger-schema.js').LedgerBalanceSnapshot }}
 */
const summariseLatest = (latest) =>
  latest === null
    ? ZERO_LATEST
    : { number: latest.number, closingBalance: latest.closingBalance }

/**
 * Append a batch of transactions to the waste balance ledger.
 *
 * Reads the latest transaction once, walks the builders in memory chaining
 * each `opening`/`closing` off the previous, and inserts the whole batch in
 * a single bulk write. A summary-log submission of N rows therefore performs
 * one read and one write regardless of N.
 *
 * Within a batch the chain of closing totals is pure arithmetic — no DB
 * round-trip is needed between rows. Other writers (e.g. an interleaved
 * PRN op) cannot perturb the chain we've already computed; they will either
 * land before the bulk insert (so our `latest` was stale) or land after
 * (so they observe our final closing). Either way, an
 * `(accreditationId, number)` collision surfaces as
 * `LedgerSlotConflictError` and recovery is the caller's responsibility:
 *
 * - Summary-log row writes recover via operator re-upload, which is
 *   already idempotent under the per-row delta-reconciliation invariant
 *   (ADR 0031 "Per-row delta reconciliation"). A re-upload converges
 *   regardless of which rows landed on the failed attempt — including
 *   partial-batch outcomes where K of N rows committed before the conflict.
 * - PRN operations are single-row batches whose handlers can surface a
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
 * @param {Array<(latest: { number: number, closingBalance: import('../repository/ledger-schema.js').LedgerBalanceSnapshot }) =>
 *   Omit<import('../repository/ledger-schema.js').LedgerTransactionInsert,
 *     'accreditationId' | 'organisationId' | 'registrationId' | 'number'>
 * >} builders
 * @returns {Promise<import('../repository/ledger-port.js').LedgerTransaction[]>}
 */
export const appendToLedger = async (
  { repository, accreditationId, organisationId, registrationId },
  builders
) => {
  if (builders.length === 0) {
    return []
  }

  const latest = summariseLatest(
    await repository.findLatestByAccreditationId(accreditationId)
  )

  const transactions = []
  let chain = latest

  for (const builder of builders) {
    const fields = builder(chain)
    const number = chain.number + 1

    transactions.push({
      ...fields,
      accreditationId,
      organisationId,
      registrationId,
      number
    })

    chain = { number, closingBalance: fields.closingBalance }
  }

  return repository.insertTransactions(transactions)
}

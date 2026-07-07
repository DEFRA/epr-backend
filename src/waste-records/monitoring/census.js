/**
 * @typedef {ReturnType<import('./reconcile-registration.js').reconcileRegistration>} RegistrationReconciliation
 */

const count = (reconciliations, predicate) =>
  reconciliations.filter(predicate).length

const sum = (reconciliations, amount) =>
  reconciliations.reduce((total, r) => total + amount(r), 0)

/**
 * Roll a set of per-registration reconciliations up into an estate-level
 * census: how many ledgers carry waste record state data, how many are
 * clean, and the totals behind any discrepancies. A clean estate (no missing
 * rows, no extra rows, no creditTotal drift, every committed ledger covered)
 * reconciles fully against the committed baseline.
 *
 * @param {RegistrationReconciliation[]} reconciliations
 */
export const summariseCensus = (reconciliations) => ({
  totalLedgers: reconciliations.length,
  ledgersWithCommittedSubmission: count(
    reconciliations,
    (r) => r.hasCommittedSubmission
  ),
  ledgersCovered: count(
    reconciliations,
    (r) => r.hasCommittedSubmission && r.hasWasteRecordStateData
  ),
  ledgersMissingSummaryLogRowStateData: count(
    reconciliations,
    (r) => r.hasCommittedSubmission && !r.hasWasteRecordStateData
  ),
  cleanLedgers: count(reconciliations, (r) => r.isClean),
  ledgersWithDiscrepancies: count(reconciliations, (r) => !r.isClean),
  totalMissingRows: sum(reconciliations, (r) => r.missingRows.length),
  totalExtraRows: sum(reconciliations, (r) => r.extraRows.length),
  ledgersWithCreditTotalDrift: count(
    reconciliations,
    (r) => r.creditTotal.drift !== 0
  ),
  totalClassificationDivergences: sum(
    reconciliations,
    (r) => r.classificationDivergences.length
  ),
  isEstateClean: reconciliations.every((r) => r.isClean)
})

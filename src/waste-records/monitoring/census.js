/**
 * @typedef {ReturnType<import('./reconcile-registration.js').reconcileRegistration>} RegistrationReconciliation
 */

const count = (reconciliations, predicate) =>
  reconciliations.filter(predicate).length

const sum = (reconciliations, amount) =>
  reconciliations.reduce((total, r) => total + amount(r), 0)

/**
 * Roll a set of per-registration reconciliations up into an estate-level
 * census: how many partitions carry committed row-state data, how many are
 * clean, and the totals behind any discrepancies. A clean estate (no missing
 * rows, no extra rows, no creditTotal drift, every committed partition covered)
 * is the green light for the backfill-complete check and the flag flip.
 *
 * @param {RegistrationReconciliation[]} reconciliations
 */
export const summariseCensus = (reconciliations) => ({
  totalPartitions: reconciliations.length,
  partitionsWithCommittedSubmission: count(
    reconciliations,
    (r) => r.hasCommittedSubmission
  ),
  partitionsCovered: count(
    reconciliations,
    (r) => r.hasCommittedSubmission && r.hasRowStateData
  ),
  partitionsMissingRowStateData: count(
    reconciliations,
    (r) => r.hasCommittedSubmission && !r.hasRowStateData
  ),
  cleanPartitions: count(reconciliations, (r) => r.isClean),
  partitionsWithDiscrepancies: count(reconciliations, (r) => !r.isClean),
  totalMissingRows: sum(reconciliations, (r) => r.missingRows.length),
  totalExtraRows: sum(reconciliations, (r) => r.extraRows.length),
  partitionsWithCreditTotalDrift: count(
    reconciliations,
    (r) => r.creditTotal.drift !== 0
  ),
  totalClassificationDivergences: sum(
    reconciliations,
    (r) => r.classificationDivergences.length
  ),
  isEstateClean: reconciliations.every((r) => r.isClean)
})

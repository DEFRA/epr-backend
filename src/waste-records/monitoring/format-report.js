/**
 * @typedef {ReturnType<import('./reconcile-registration.js').reconcileRegistration>} RegistrationReconciliation
 * @typedef {ReturnType<import('./census.js').summariseCensus>} Census
 */

const partitionLabel = ({ registrationId, accreditationId }) =>
  accreditationId === null
    ? `registration ${registrationId} (registered-only)`
    : `registration ${registrationId} / accreditation ${accreditationId}`

const rowRefLabel = ({ wasteRecordType, rowId }) =>
  `${wasteRecordType}:${rowId}`

const inclusionLabel = (included) => (included ? 'included' : 'excluded')

const reasonLabel = ({ code, field }) => (field ? `${code} (${field})` : code)

const divergenceLabel = (divergence) =>
  [
    rowRefLabel(divergence),
    `(waste record state ${inclusionLabel(divergence.wasteRecordStateIncluded)},`,
    `legacy ${inclusionLabel(divergence.legacyIncluded)};`,
    `reasons: ${divergence.reasons.length > 0 ? divergence.reasons.map(reasonLabel).join(', ') : 'none'})`
  ].join(' ')

/**
 * The discrepancies for one partition, each rendered as a fragment. Coverage
 * gaps, missing/extra rows and creditTotal drift are listed alongside
 * classification divergences with their reasons — under current-factors
 * backfill, divergences are expected findings to review (an overseas site
 * approved since submission, for instance), not failures.
 *
 * @param {RegistrationReconciliation} r
 * @returns {string[]}
 */
const partitionFindings = (r) => {
  const findings = []
  if (r.hasCommittedSubmission && !r.hasWasteRecordStateData) {
    findings.push('no waste record state data')
  }
  if (r.missingRows.length > 0) {
    findings.push(`missing rows: ${r.missingRows.map(rowRefLabel).join(', ')}`)
  }
  if (r.extraRows.length > 0) {
    findings.push(`extra rows: ${r.extraRows.map(rowRefLabel).join(', ')}`)
  }
  if (r.creditTotal.drift !== 0) {
    findings.push(
      `creditTotal drift: ${r.creditTotal.drift} (waste record states ${r.creditTotal.wasteRecordStates} vs event ${r.creditTotal.event})`
    )
  }
  if (r.classificationDivergences.length > 0) {
    findings.push(
      `classification divergences: ${r.classificationDivergences.map(divergenceLabel).join('; ')}`
    )
  }
  return findings
}

/**
 * Whether a partition carries anything worth logging for review — a hard
 * discrepancy (coverage gap, missing/extra rows, creditTotal drift) or a
 * classification divergence.
 *
 * @param {RegistrationReconciliation} r
 * @returns {boolean}
 */
export const hasReviewableFindings = (r) =>
  !r.isClean || r.classificationDivergences.length > 0

/**
 * Render a single partition's discrepancies as one reviewable line: the
 * partition label, its committed head, and each finding. Mirrors the
 * waste-balance ledger migration diagnostic — one line per affected partition,
 * read and confirmed against expectations before the write-flag flip.
 *
 * @param {RegistrationReconciliation} r
 * @returns {string}
 */
export const formatPartitionDiagnostic = (r) =>
  `Waste record state discrepancy: ${partitionLabel(r)}, head ${r.head} — ${partitionFindings(r).join('; ')}`

/**
 * Render the estate-level census as a single summary line. No pass/fail
 * verdict: discrepancies are reviewed against expectations (overseas-site and
 * other factor drift) rather than gating the flip.
 *
 * @param {Census} census
 * @returns {string}
 */
export const formatCensusSummary = (census) =>
  [
    'Waste record state reconciliation census:',
    `partitions: ${census.totalPartitions},`,
    `with committed submission: ${census.partitionsWithCommittedSubmission},`,
    `covered: ${census.partitionsCovered},`,
    `missing waste record state data: ${census.partitionsMissingWasteRecordStateData},`,
    `with discrepancies: ${census.partitionsWithDiscrepancies},`,
    `missing rows: ${census.totalMissingRows},`,
    `extra rows: ${census.totalExtraRows},`,
    `creditTotal drift: ${census.partitionsWithCreditTotalDrift},`,
    `classification divergences: ${census.totalClassificationDivergences}`
  ].join(' ')

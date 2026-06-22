/**
 * @typedef {ReturnType<import('./reconcile-registration.js').reconcileRegistration>} RegistrationReconciliation
 * @typedef {ReturnType<import('./census.js').summariseCensus>} Census
 */

const partitionLabel = ({ registrationId, accreditationId }) =>
  accreditationId === null
    ? `registration ${registrationId} (registered-only)`
    : `registration ${registrationId} / accreditation ${accreditationId}`

/**
 * The hard discrepancies that block the flag flip, rendered for one partition.
 * Classification divergences are deliberately excluded — they are a
 * context-sensitive signal reported in the census, not a blocker.
 *
 * @param {RegistrationReconciliation} r
 * @returns {string[]}
 */
const partitionIssues = (r) => {
  const issues = []
  if (r.hasCommittedSubmission && !r.hasRowStateData) {
    issues.push('no row-state data')
  }
  if (r.missingRows.length > 0) {
    issues.push(`missing rows: ${r.missingRows.length}`)
  }
  if (r.extraRows.length > 0) {
    issues.push(`extra rows: ${r.extraRows.length}`)
  }
  if (r.creditTotal.drift !== 0) {
    issues.push(`creditTotal drift: ${r.creditTotal.drift}`)
  }
  return issues
}

/**
 * Render the estate reconciliation as a human-readable report: the verdict, the
 * coverage census, and one line per partition carrying a hard discrepancy. A
 * CLEAN verdict is the green light for the backfill-complete check and the flag
 * flip.
 *
 * @param {{ reconciliations: RegistrationReconciliation[], census: Census }} result
 * @returns {string}
 */
export const formatReport = ({ reconciliations, census }) => {
  const lines = []

  lines.push(
    census.isEstateClean
      ? 'VERDICT: CLEAN — committed row-states reconcile with the waste-records committed state.'
      : 'VERDICT: DISCREPANCIES FOUND — committed row-states do not yet reconcile.'
  )

  lines.push('')
  lines.push('Coverage census:')
  lines.push(`  Partitions: ${census.totalPartitions}`)
  lines.push(
    `  With committed submission: ${census.partitionsWithCommittedSubmission}`
  )
  lines.push(
    `  Partitions covered: ${census.partitionsCovered}/${census.partitionsWithCommittedSubmission}`
  )
  lines.push(
    `  Missing row-state data: ${census.partitionsMissingRowStateData}`
  )
  lines.push(`  Missing rows (total): ${census.totalMissingRows}`)
  lines.push(`  Extra rows (total): ${census.totalExtraRows}`)
  lines.push(
    `  Partitions with creditTotal drift: ${census.partitionsWithCreditTotalDrift}`
  )
  lines.push(
    `  Classification divergences (context-sensitive): ${census.totalClassificationDivergences}`
  )

  const discrepant = reconciliations.filter((r) => !r.isClean)
  if (discrepant.length > 0) {
    lines.push('')
    lines.push('Partitions with discrepancies:')
    for (const r of discrepant) {
      lines.push(`  - ${partitionLabel(r)}: ${partitionIssues(r).join(', ')}`)
    }
  }

  return lines.join('\n')
}

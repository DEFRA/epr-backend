import { summaryLogMetrics } from '#application/summary-logs/metrics.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {ProcessingType} from '#domain/summary-logs/meta-fields.js' */
/** @import {SummaryLogStatus} from '#domain/summary-logs/status.js' */

/**
 * Records validation issue metrics grouped by severity × category
 *
 * @param {ValidationIssuesCollector} issues - Validation issues object
 * @param {string} processingType - The processing type for the metric dimension
 */
const recordValidationIssueMetrics = async (issues, processingType) => {
  const allIssues = issues.getAllIssues()
  if (allIssues.length === 0) {
    return
  }

  // Count issues by severity × category
  const counts = new Map()
  for (const issue of allIssues) {
    const key = `${issue.severity}:${issue.category}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  // Record metrics for each combination
  await Promise.all(
    [...counts].map(([key, count]) => {
      const [severity, category] = key.split(':')
      return summaryLogMetrics.recordValidationIssues(
        {
          severity:
            /** @type {import('#application/summary-logs/metrics.js').ValidationSeverity} */ (
              severity
            ),
          category:
            /** @type {import('#application/summary-logs/metrics.js').ValidationCategory} */ (
              category
            ),
          processingType: /** @type {ProcessingType} */ (processingType)
        },
        count
      )
    })
  )
}

/**
 * Records row outcome metrics grouped by outcome
 *
 * @param {ValidatedWasteRecord[] | null} wasteRecords - Waste records with outcomes
 * @param {string} processingType - The processing type for the metric dimension
 */
const recordRowOutcomeMetrics = async (wasteRecords, processingType) => {
  if (!wasteRecords || wasteRecords.length === 0) {
    return
  }

  // Count by outcome
  const counts = {
    [ROW_OUTCOME.INCLUDED]: 0,
    [ROW_OUTCOME.EXCLUDED]: 0,
    [ROW_OUTCOME.REJECTED]: 0,
    [ROW_OUTCOME.IGNORED]: 0
  }

  for (const { outcome } of wasteRecords) {
    counts[outcome]++
  }

  // Record metrics for each outcome with non-zero count
  await Promise.all(
    Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([outcome, count]) =>
        summaryLogMetrics.recordRowOutcome(
          {
            outcome:
              /** @type {import('#application/summary-logs/metrics.js').RowOutcome} */ (
                outcome
              ),
            processingType: /** @type {ProcessingType} */ (processingType)
          },
          count
        )
      )
  )
}

/**
 * Records all validation-related metrics.
 *
 * @param {Object} params
 * @param {ValidationIssuesCollector} params.issues
 * @param {ProcessingType} params.processingType
 * @param {SummaryLogStatus} params.status
 * @param {number} params.validationDurationMs
 * @param {ValidatedWasteRecord[]} params.wasteBalanceRecords
 */
export const recordValidationMetrics = async ({
  issues,
  processingType,
  status,
  validationDurationMs,
  wasteBalanceRecords
}) => {
  await summaryLogMetrics.recordValidationDuration(
    { processingType },
    validationDurationMs
  )
  await summaryLogMetrics.recordStatusTransition({ status, processingType })
  await recordValidationIssueMetrics(issues, processingType)
  await recordRowOutcomeMetrics(wasteBalanceRecords, processingType)
}

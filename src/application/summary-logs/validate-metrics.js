import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {ProcessingType} from '#domain/summary-logs/meta-fields.js' */
/** @import {SummaryLogStatus} from '#domain/summary-logs/status.js' */

/**
 * Records validation issue metrics grouped by severity x category
 *
 * @param {ValidationIssuesCollector} issues
 * @param {string} processingType
 */
const recordValidationIssueMetrics = async (issues, processingType) => {
  const allIssues = issues.getAllIssues()
  if (allIssues.length === 0) {
    return
  }

  const counts = new Map()
  for (const issue of allIssues) {
    const key = `${issue.severity}:${issue.category}`
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  for (const [key, count] of counts) {
    const [severity, category] = key.split(':')
    await summaryLogMetrics.recordValidationIssues(
      {
        severity:
          /** @type {import('#common/helpers/metrics/summary-logs.js').ValidationSeverity} */ (
            severity
          ),
        category:
          /** @type {import('#common/helpers/metrics/summary-logs.js').ValidationCategory} */ (
            category
          ),
        processingType: /** @type {ProcessingType} */ (processingType)
      },
      count
    )
  }
}

/**
 * Records row outcome metrics grouped by outcome
 *
 * @param {ValidatedWasteRecord[] | null} wasteRecords
 * @param {string} processingType
 */
const recordRowOutcomeMetrics = async (wasteRecords, processingType) => {
  if (!wasteRecords || wasteRecords.length === 0) {
    return
  }

  const counts = {
    [ROW_OUTCOME.INCLUDED]: 0,
    [ROW_OUTCOME.EXCLUDED]: 0,
    [ROW_OUTCOME.REJECTED]: 0,
    [ROW_OUTCOME.IGNORED]: 0
  }

  for (const { outcome } of wasteRecords) {
    counts[outcome]++
  }

  for (const [outcome, count] of Object.entries(counts)) {
    if (count > 0) {
      await summaryLogMetrics.recordRowOutcome(
        {
          outcome:
            /** @type {import('#common/helpers/metrics/summary-logs.js').RowOutcome} */ (
              outcome
            ),
          processingType: /** @type {ProcessingType} */ (processingType)
        },
        count
      )
    }
  }
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

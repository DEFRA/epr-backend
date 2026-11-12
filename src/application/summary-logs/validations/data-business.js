import { createValidationIssues } from '#common/validation/validation-issues.js'
import { validateRowContinuity } from './row-continuity.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {PreviousSubmission} from '#waste-records/application/read-summary-log-row-states.js' */
/** @import {TableSchema} from '#domain/summary-logs/table-schemas/index.js' */

/**
 * Validates data business rules
 *
 * Level 4: Data Business Validation
 * - Validates that no rows from previous uploads have been removed
 * - Only applies to subsequent uploads (not first-time uploads)
 * - Missing rows result in FATAL errors that block submission
 *
 * This validation ensures data integrity across sequential summary log submissions.
 * Once a waste balance entry has been submitted, it cannot be removed in future uploads.
 * However, entries can be:
 * - Added (new waste balance entries)
 * - Updated (corrections to existing entries)
 * - Unchanged (carried forward as-is)
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords - Waste records from the current upload
 * @param {PreviousSubmission | null} params.previousSubmission - The latest submitted summary log with its row states, or null when the registration has never submitted
 * @param {Record<string, Pick<TableSchema, 'wasteRecordType'|'sheetName'>>} params.tableSchemas - The upload's template table schemas
 * @returns {ValidationIssuesCollector} Validation issues object
 */
export const validateDataBusiness = ({
  wasteRecords,
  previousSubmission,
  tableSchemas
}) => {
  const issues = createValidationIssues()

  for (const validate of [
    validateRowContinuity
    // Future validators can be added here:
    // validateWasteBalance,
    // validateTonnageAccuracy,
    // etc.
  ]) {
    issues.merge(validate({ wasteRecords, previousSubmission, tableSchemas }))
  }

  return issues
}

import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/validation.js'
import {
  findSchemaByWasteRecordType,
  PROCESSING_TYPE_TABLES
} from '#domain/summary-logs/table-schemas/index.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {ValidationIssuesCollector} from '#common/validation/validation-issues.js' */
/** @import {PreviousSubmission} from '#waste-records/application/read-summary-log-row-states.js' */

/**
 * @param {string} wasteRecordType
 * @param {string} rowId
 * @returns {string}
 */
const rowKey = (wasteRecordType, rowId) => `${wasteRecordType}:${rowId}`

/**
 * Validates that no rows from the previous submission have been removed
 *
 * This validation ensures data integrity across sequential summary log submissions.
 * Once a waste balance entry has been submitted, it cannot be removed in future uploads.
 * However, entries can be:
 * - Added (new waste balance entries)
 * - Updated (corrections to existing entries)
 * - Unchanged (carried forward as-is)
 *
 * The rows that must be carried forward are the row states of the registration's
 * latest submitted summary log, and that summary log is the one the FATAL names.
 * Only applies to subsequent uploads (not first-time uploads). Missing rows result
 * in FATAL errors that block submission.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords - Waste records from the current upload
 * @param {PreviousSubmission | null} params.previousSubmission - The latest submitted summary log with its row states, or null when the registration has never submitted
 * @returns {ValidationIssuesCollector} Validation issues object
 */
export const validateRowContinuity = ({ wasteRecords, previousSubmission }) => {
  const issues = createValidationIssues()

  if (previousSubmission === null) {
    return issues
  }

  const { summaryLog, wasteRecordStates } = previousSubmission

  const uploadedRowKeys = new Set(
    wasteRecords.map(({ record }) => rowKey(record.type, String(record.rowId)))
  )

  const removedRowStates = wasteRecordStates.filter(
    ({ wasteRecordType, rowId }) =>
      !uploadedRowKeys.has(rowKey(wasteRecordType, rowId))
  )

  for (const { wasteRecordType, rowId } of removedRowStates) {
    const match = findSchemaByWasteRecordType(
      wasteRecordType,
      PROCESSING_TYPE_TABLES
    )

    issues.addFatal(
      VALIDATION_CATEGORY.BUSINESS,
      `Row '${rowId}' from a previous summary log submission cannot be removed. All previously submitted rows must be included in subsequent uploads.`,
      VALIDATION_CODE.SEQUENTIAL_ROW_REMOVED,
      {
        location: {
          sheet: match?.schema.sheetName ?? 'Unknown',
          table: match?.tableName ?? 'Unknown',
          rowId
        },
        previousSummaryLog: {
          id: summaryLog.summaryLogId,
          submittedAt: summaryLog.submittedAt.toISOString()
        }
      }
    )
  }

  return issues
}

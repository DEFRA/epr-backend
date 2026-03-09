import { createValidationIssues } from '#common/validation/validation-issues.js'
import {
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/enums/validation.js'
import {
  findSchemaByWasteRecordType,
  PROCESSING_TYPE_TABLES
} from '#domain/summary-logs/table-schemas/index.js'

/**
 * @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord
 * @typedef {import('../validate.js').ValidatedWasteRecord} ValidatedWasteRecord
 */

/**
 * Validates that no rows from previous uploads have been removed
 *
 * This validation ensures data integrity across sequential summary log submissions.
 * Once a waste balance entry has been submitted, it cannot be removed in future uploads.
 * However, entries can be:
 * - Added (new waste balance entries)
 * - Updated (corrections to existing entries)
 * - Unchanged (carried forward as-is)
 *
 * Only applies to subsequent uploads (not first-time uploads).
 * Missing rows result in FATAL errors that block submission.
 *
 * @param {Object} params
 * @param {ValidatedWasteRecord[]} params.wasteRecords - Waste records from the current upload
 * @param {WasteRecord[]} params.existingWasteRecords - Existing waste records from previous uploads
 * @returns {Object} Validation issues object
 */
export const validateRowContinuity = ({
  wasteRecords,
  existingWasteRecords
}) => {
  const issues = createValidationIssues()

  if (!existingWasteRecords || existingWasteRecords.length === 0) {
    return issues
  }

  const existingRowKeys = new Set(
    existingWasteRecords.map((record) => `${record.type}:${record.rowId}`)
  )

  const existingRecordsMap = new Map(
    existingWasteRecords.map((record) => [
      `${record.type}:${record.rowId}`,
      record
    ])
  )

  const newRowKeys = new Set(
    wasteRecords.map(({ record }) => `${record.type}:${record.rowId}`)
  )

  const missingRowKeys = [...existingRowKeys].filter(
    (key) => !newRowKeys.has(key)
  )

  if (missingRowKeys.length > 0) {
    for (const missingKey of missingRowKeys) {
      const [type, rowId] = missingKey.split(':')
      // Key came from existingRowKeys derived from same source as map, so guaranteed to exist
      const originalRecord = /** @type {WasteRecord} */ (
        existingRecordsMap.get(missingKey)
      )

      const lastVersion =
        originalRecord.versions[originalRecord.versions.length - 1]

      const match = findSchemaByWasteRecordType(type, PROCESSING_TYPE_TABLES)

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
            id: lastVersion.summaryLog.id,
            submittedAt: lastVersion.createdAt
          }
        }
      )
    }
  }

  return issues
}

import {
  createValidationIssues,
  VALIDATION_CATEGORY,
  VALIDATION_CODE
} from '#common/validation/validation-issues.js'
import { transformFromSummaryLog } from '#application/waste-records/transform-from-summary-log.js'

/**
 * @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord
 */

/**
 * Maps waste record type to the corresponding sheet name in the spreadsheet
 *
 * @param {string} type - The waste record type (e.g., 'received', 'processed')
 * @returns {string} The sheet name
 */
const getSheetForType = (type) => {
  const sheetMapping = {
    received: 'Received',
    processed: 'Processed',
    sentOn: 'Sent on',
    exported: 'Exported'
  }
  return sheetMapping[type] || 'Unknown'
}

/**
 * Maps waste record type to the corresponding table name
 *
 * @param {string} type - The waste record type
 * @returns {string} The table name
 */
const getTableForType = (type) => {
  const tableMapping = {
    received: 'RECEIVED_LOADS_FOR_REPROCESSING',
    processed: 'PROCESSED_LOADS',
    sentOn: 'SENT_ON_LOADS',
    exported: 'EXPORTED_LOADS'
  }
  return tableMapping[type] || 'UNKNOWN_TABLE'
}

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
 * @param {Object} params.parsed - The parsed summary log data
 * @param {Object} params.summaryLog - The summary log being validated
 * @param {WasteRecord[]} params.existingWasteRecords - Existing waste records from previous uploads
 * @returns {Object} Validation issues object
 */
export const validateRowContinuity = ({
  parsed,
  summaryLog,
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

  try {
    const transformedRecords = transformFromSummaryLog(
      parsed,
      {
        summaryLog: {
          id: summaryLog.id,
          uri: summaryLog.file.uri
        },
        organisationId: summaryLog.organisationId,
        registrationId: summaryLog.registrationId,
        accreditationId: summaryLog.accreditationId
      },
      existingRecordsMap
    )

    const newRowKeys = new Set(
      transformedRecords.map((record) => `${record.type}:${record.rowId}`)
    )

    const missingRowKeys = [...existingRowKeys].filter(
      (key) => !newRowKeys.has(key)
    )

    if (missingRowKeys.length > 0) {
      for (const missingKey of missingRowKeys) {
        const [type, rowId] = missingKey.split(':')
        const originalRecord = existingWasteRecords.find(
          (r) => r.type === type && r.rowId === rowId
        )

        const lastVersion =
          originalRecord.versions[originalRecord.versions.length - 1]

        issues.addFatal(
          VALIDATION_CATEGORY.BUSINESS,
          `Row '${rowId}' from a previous summary log submission cannot be removed. All previously submitted rows must be included in subsequent uploads.`,
          VALIDATION_CODE.SEQUENTIAL_ROW_REMOVED,
          {
            location: {
              sheet: getSheetForType(type),
              table: getTableForType(type),
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
  } catch (error) {
    // If transformation fails at this stage, something has gone seriously wrong
    // Previous validation levels should have caught data issues, so this indicates
    // either a validation gap or data corruption
    issues.addFatal(
      VALIDATION_CATEGORY.TECHNICAL,
      error.message,
      VALIDATION_CODE.VALIDATION_SYSTEM_ERROR
    )
  }

  return issues
}

import { VERSION_STATUS } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { transformReceivedLoadsRow } from './row-transformers/received-loads-reprocessing.js'

/**
 * @typedef {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog} ParsedSummaryLog
 * @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord
 * @typedef {import('#application/summary-logs/validations/data-syntax.js').ValidatedRow} ValidatedRow
 * @typedef {import('#common/validation/validation-issues.js').ValidationIssue} ValidationIssue
 */

/**
 * A waste record bundled with its validation issues
 *
 * Issues are present when transforming validated rows (from validation pipeline)
 * Issues are absent when transforming unvalidated rows (from sync pipeline)
 *
 * @typedef {Object} ValidatedWasteRecord
 * @property {WasteRecord} record - The waste record
 * @property {ValidationIssue[]} [issues] - Validation issues (present if input was validated)
 */

/**
 * Dispatch map: processing type → table name → row transformer function
 * Maps each combination of processing type and table to its specific row transformer
 */
const TABLE_TRANSFORMERS = {
  [PROCESSING_TYPES.REPROCESSOR_INPUT]: {
    RECEIVED_LOADS_FOR_REPROCESSING: transformReceivedLoadsRow
  },
  [PROCESSING_TYPES.REPROCESSOR_OUTPUT]: {
    RECEIVED_LOADS_FOR_REPROCESSING: transformReceivedLoadsRow
  },
  [PROCESSING_TYPES.EXPORTER]: {
    // No table transformers yet - awaiting business confirmation of data mappings
  }
}

const KNOWN_PROCESSING_TYPES = Object.values(PROCESSING_TYPES)

/**
 * Generic table transformation function
 * Iterates over rows, transforms each using a row transformer, and creates or updates waste records
 *
 * Rows may be validated ({ values, rowId, issues }) or unvalidated ({ values, rowId })
 * If issues are present on input rows, they flow through to the output
 *
 * @param {Object} tableData - Table data with headers and rows
 * @param {Function} rowTransformer - Function to transform each row
 * @param {Object} context - Context for creating waste records
 * @param {Map<string, WasteRecord>} [existingRecords] - Optional map of existing waste records keyed by "${type}:${rowId}"
 * @returns {ValidatedWasteRecord[]} Array of waste records with issues
 */
const transformTable = (
  tableData,
  rowTransformer,
  context,
  existingRecords
) => {
  const { headers, rows } = tableData
  const { summaryLog, organisationId, registrationId, accreditationId } =
    context

  return rows.map((row) => {
    const { values, issues } = row

    // Map row values to object using headers
    const rowData = headers.reduce((acc, header, index) => {
      acc[header] = values[index]
      return acc
    }, /** @type {Record<string, any>} */ ({}))

    // Transform row using type-specific transformer
    const { wasteRecordType, rowId, data } = rowTransformer(rowData)

    // Look up existing waste record from Map if provided
    const existingRecord =
      existingRecords?.get(`${wasteRecordType}:${rowId}`) ?? null

    if (existingRecord) {
      // Calculate delta: find fields that changed (excluding ROW_ID)
      const delta = {}
      for (const [key, value] of Object.entries(data)) {
        if (key !== 'ROW_ID' && existingRecord.data[key] !== value) {
          delta[key] = value
        }
      }

      // If nothing changed, return existing record unchanged
      if (Object.keys(delta).length === 0) {
        return { record: existingRecord, issues }
      }

      // Add new version with only changed fields
      const newVersion = {
        createdAt: new Date().toISOString(),
        status: VERSION_STATUS.UPDATED,
        summaryLog,
        data: delta
      }

      return {
        record: {
          ...existingRecord,
          data,
          versions: [...existingRecord.versions, newVersion]
        },
        issues
      }
    }

    // Create new waste record
    const version = {
      createdAt: new Date().toISOString(),
      status: VERSION_STATUS.CREATED,
      summaryLog,
      data
    }

    const wasteRecord = {
      organisationId,
      registrationId,
      rowId,
      type: wasteRecordType,
      data,
      versions: [version]
    }

    // Only include accreditationId if provided
    if (accreditationId) {
      wasteRecord.accreditationId = accreditationId
    }

    return { record: wasteRecord, issues }
  })
}

/**
 * Transforms parsed summary log data into waste records
 *
 * Expects validated rows in structure: { values: [...], rowId: string, issues: [...] }
 * Issues flow through transformation and are returned with each record
 *
 * @param {ParsedSummaryLog} parsedData - The parsed summary log data with validated rows
 * @param {Object} summaryLogContext - Context from the summary log
 * @param {Object} summaryLogContext.summaryLog - The summary log reference
 * @param {string} summaryLogContext.summaryLog.id - The summary log ID
 * @param {string} summaryLogContext.summaryLog.uri - The S3 URI for the summary log
 * @param {string} summaryLogContext.organisationId - The organisation ID
 * @param {string} summaryLogContext.registrationId - The registration ID
 * @param {string} [summaryLogContext.accreditationId] - Optional accreditation ID
 * @param {Map<string, WasteRecord>} [existingRecords] - Optional map of existing waste records keyed by "${type}:${rowId}"
 * @returns {ValidatedWasteRecord[]} Array of waste records with issues
 */
export const transformFromSummaryLog = (
  parsedData,
  summaryLogContext,
  existingRecords
) => {
  // Check for unknown processing type
  const processingType = parsedData.meta.PROCESSING_TYPE?.value
  if (processingType && !KNOWN_PROCESSING_TYPES.includes(processingType)) {
    throw new Error(`Unknown PROCESSING_TYPE: ${processingType}`)
  }

  // Look up table transformers for this processing type
  const tableTransformers = TABLE_TRANSFORMERS[processingType] || {}

  // Transform each table that exists in the parsed data
  const results = Object.entries(tableTransformers).map(
    ([tableName, rowTransformer]) => {
      const tableData = parsedData.data[tableName]

      // Skip tables that don't exist in this summary log
      if (!tableData) {
        return []
      }

      return transformTable(
        tableData,
        rowTransformer,
        summaryLogContext,
        existingRecords
      )
    }
  )

  return results.flat()
}

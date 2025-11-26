import { VERSION_STATUS } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { transformReceivedLoadsRow } from './row-transformers/received-loads-reprocessing.js'

/**
 * @typedef {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog} ParsedSummaryLog
 * @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord
 */

/**
 * A row structured for transformation
 * @typedef {Object} StructuredRow
 * @property {Array<*>} values - Row values array
 * @property {string} rowId - Extracted row ID
 */

/**
 * A transformed record with source location for correlation
 * @typedef {Object} TransformedRecord
 * @property {WasteRecord} record - The waste record
 * @property {{ table: string, rowIndex: number }} source - Source location for correlating with validation issues
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
 * Rows are expected in structure: { values: [...], rowId: string }
 *
 * @param {string} tableName - Name of the table being transformed
 * @param {Object} tableData - Table data with headers and rows
 * @param {Function} rowTransformer - Function to transform each row
 * @param {Object} context - Context for creating waste records
 * @param {Map<string, WasteRecord>} [existingRecords] - Optional map of existing waste records keyed by "${type}:${rowId}"
 * @returns {TransformedRecord[]} Array of transformed records with source info
 */
const transformTable = (
  tableName,
  tableData,
  rowTransformer,
  context,
  existingRecords
) => {
  const { headers, rows } = tableData
  const { summaryLog, organisationId, registrationId, accreditationId } =
    context

  return rows.map((row, rowIndex) => {
    const { values } = row

    // Map row values to object using headers
    const rowData = headers.reduce((acc, header, index) => {
      acc[header] = values[index]
      return acc
    }, /** @type {Record<string, any>} */ ({}))

    // Transform row using type-specific transformer
    const { wasteRecordType, rowId, data } = rowTransformer(rowData, rowIndex)

    // Look up existing waste record from Map if provided
    const existingRecord =
      existingRecords?.get(`${wasteRecordType}:${rowId}`) ?? null

    const source = { table: tableName, rowIndex }

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
        return { record: existingRecord, source }
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
        source
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

    return { record: wasteRecord, source }
  })
}

/**
 * Transforms parsed summary log data into waste records
 *
 * Expects rows in structure: { values: [...], rowId: string }
 * Returns records with source info for correlation with validation issues
 *
 * @param {ParsedSummaryLog} parsedData - The parsed summary log data
 * @param {Object} summaryLogContext - Context from the summary log
 * @param {Object} summaryLogContext.summaryLog - The summary log reference
 * @param {string} summaryLogContext.summaryLog.id - The summary log ID
 * @param {string} summaryLogContext.summaryLog.uri - The S3 URI for the summary log
 * @param {string} summaryLogContext.organisationId - The organisation ID
 * @param {string} summaryLogContext.registrationId - The registration ID
 * @param {string} [summaryLogContext.accreditationId] - Optional accreditation ID
 * @param {Map<string, WasteRecord>} [existingRecords] - Optional map of existing waste records keyed by "${type}:${rowId}"
 * @returns {TransformedRecord[]} Array of transformed records with source info
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
        tableName,
        tableData,
        rowTransformer,
        summaryLogContext,
        existingRecords
      )
    }
  )

  return results.flat()
}

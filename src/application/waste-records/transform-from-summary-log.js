import { VERSION_STATUS } from '#domain/waste-records/model.js'
import { transformReceivedLoadsRow } from './row-transformers/received-loads-reprocessing.js'

/**
 * @typedef {import('#domain/summary-logs/extractor/port.js').ParsedSummaryLog} ParsedSummaryLog
 * @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord
 */

/**
 * Transforms parsed summary log data into waste records
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
 * @returns {WasteRecord[]} Array of waste records
 */
/**
 * Dispatch map: processing type → table name → row transformer function
 * Maps each combination of processing type and table to its specific row transformer
 */
const PROCESSING_TYPES = {
  REPROCESSOR_INPUT: {
    RECEIVED_LOADS_FOR_REPROCESSING: transformReceivedLoadsRow
  },
  REPROCESSOR_OUTPUT: {
    RECEIVED_LOADS_FOR_REPROCESSING: transformReceivedLoadsRow
  },
  EXPORTER: {
    // TODO: Add table transformers when business confirms mappings
  }
}

const KNOWN_PROCESSING_TYPES = Object.keys(PROCESSING_TYPES)

/**
 * Generic table transformation function
 * Iterates over rows, transforms each using a row transformer, and creates or updates waste records
 *
 * @param {Object} tableData - Table data with headers and rows
 * @param {Function} rowTransformer - Function to transform each row
 * @param {Object} context - Context for creating waste records
 * @param {Map<string, WasteRecord>} [existingRecords] - Optional map of existing waste records keyed by "${type}:${rowId}"
 * @returns {WasteRecord[]} Array of waste records
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

  return rows.map((row, rowIndex) => {
    // Map row values to object using headers
    const rowData = headers.reduce((acc, header, index) => {
      acc[header] = row[index]
      return acc
    }, /** @type {Record<string, any>} */ ({}))

    // Transform row using type-specific transformer
    const { wasteRecordType, rowId, data } = rowTransformer(rowData, rowIndex)

    // Look up existing waste record from Map if provided
    const existingRecord =
      existingRecords?.get(`${wasteRecordType}:${rowId}`) ?? null

    if (existingRecord) {
      // Add new version to existing record
      const newVersion = {
        createdAt: new Date().toISOString(),
        status: VERSION_STATUS.UPDATED,
        summaryLog,
        data
      }

      return {
        ...existingRecord,
        data,
        versions: [...existingRecord.versions, newVersion]
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

    return wasteRecord
  })
}

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
  const tableTransformers = PROCESSING_TYPES[processingType] || {}

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

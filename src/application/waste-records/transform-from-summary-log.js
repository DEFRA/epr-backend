import { randomUUID } from 'node:crypto'
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
 * @param {Function} [findExistingRecord] - Optional function to find existing waste records
 * @returns {Promise<WasteRecord[]>} Array of waste records
 */
const KNOWN_PROCESSING_TYPES = [
  'REPROCESSOR_INPUT',
  'REPROCESSOR_OUTPUT',
  'EXPORTER'
]

/**
 * Generic table transformation function
 * Iterates over rows, transforms each using a row transformer, and creates or updates waste records
 *
 * @param {Object} tableData - Table data with headers and rows
 * @param {Function} rowTransformer - Function to transform each row
 * @param {Object} context - Context for creating waste records
 * @param {Function} [findExistingRecord] - Optional function to find existing waste records
 * @returns {Promise<WasteRecord[]>} Array of waste records
 */
const transformTable = async (
  tableData,
  rowTransformer,
  context,
  findExistingRecord
) => {
  const { headers, rows } = tableData
  const { summaryLog, organisationId, registrationId, accreditationId } =
    context

  return Promise.all(
    rows.map(async (row, rowIndex) => {
      // Map row values to object using headers
      const rowData = headers.reduce((acc, header, index) => {
        acc[header] = row[index]
        return acc
      }, /** @type {Record<string, any>} */ ({}))

      // Transform row using type-specific transformer
      const { wasteRecordType, rowId, data } = await rowTransformer(
        rowData,
        rowIndex
      )

      // Look up existing waste record if finder function provided
      const existingRecord = findExistingRecord
        ? await findExistingRecord(
            organisationId,
            registrationId,
            wasteRecordType,
            rowId
          )
        : null

      if (existingRecord) {
        // Add new version to existing record
        const newVersion = {
          id: randomUUID(),
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
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        status: VERSION_STATUS.CREATED,
        summaryLog,
        data
      }

      const wasteRecord = {
        id: randomUUID(),
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
  )
}

export const transformFromSummaryLog = async (
  parsedData,
  summaryLogContext,
  findExistingRecord
) => {
  // Check for unknown processing type
  const processingType = parsedData.meta.PROCESSING_TYPE?.value
  if (processingType && !KNOWN_PROCESSING_TYPES.includes(processingType)) {
    throw new Error(`Unknown PROCESSING_TYPE: ${processingType}`)
  }

  const receivedLoadsData = parsedData.data.RECEIVED_LOADS_FOR_REPROCESSING

  if (!receivedLoadsData) {
    return []
  }

  return transformTable(
    receivedLoadsData,
    transformReceivedLoadsRow,
    summaryLogContext,
    findExistingRecord
  )
}

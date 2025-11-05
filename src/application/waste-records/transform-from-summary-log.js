import { randomUUID } from 'node:crypto'
import {
  WASTE_RECORD_TYPE,
  VERSION_STATUS
} from '#domain/waste-records/model.js'

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

  const { headers, rows } = receivedLoadsData
  const { summaryLog, organisationId, registrationId, accreditationId } =
    summaryLogContext

  return Promise.all(
    rows.map(async (row) => {
      // Map row values to object using headers
      const rowData = headers.reduce((acc, header, index) => {
        acc[header] = row[index]
        return acc
      }, /** @type {Record<string, any>} */ ({}))

      // Extract rowId (should be first column based on ROW_ID header)
      const rowId = rowData.ROW_ID

      // Look up existing waste record if finder function provided
      const existingRecord = findExistingRecord
        ? await findExistingRecord(
            organisationId,
            registrationId,
            WASTE_RECORD_TYPE.RECEIVED,
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
          data: rowData
        }

        return {
          ...existingRecord,
          data: rowData,
          versions: [...existingRecord.versions, newVersion]
        }
      }

      // Create new waste record
      const version = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        status: VERSION_STATUS.CREATED,
        summaryLog,
        data: rowData
      }

      const wasteRecord = {
        id: randomUUID(),
        organisationId,
        registrationId,
        rowId,
        type: WASTE_RECORD_TYPE.RECEIVED,
        data: rowData,
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

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
 * @param {string} summaryLogContext.summaryLogId - The summary log ID
 * @param {string} summaryLogContext.summaryLogUri - The S3 URI for the summary log
 * @param {string} summaryLogContext.organisationId - The organisation ID
 * @param {string} summaryLogContext.registrationId - The registration ID
 * @param {string} [summaryLogContext.accreditationId] - Optional accreditation ID
 * @returns {WasteRecord[]} Array of waste records
 */
export const transformFromSummaryLog = (parsedData, summaryLogContext) => {
  const receivedLoadsData = parsedData.data.RECEIVED_LOADS

  if (!receivedLoadsData) {
    return []
  }

  const { headers, rows } = receivedLoadsData
  const {
    summaryLogId,
    summaryLogUri,
    organisationId,
    registrationId,
    accreditationId
  } = summaryLogContext

  return rows.map((row) => {
    // Map row values to object using headers
    const rowData = headers.reduce((acc, header, index) => {
      acc[header] = row[index]
      return acc
    }, /** @type {Record<string, any>} */ ({}))

    // Extract rowId (should be first column based on ROW_ID header)
    const rowId = rowData.ROW_ID

    const version = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: VERSION_STATUS.CREATED,
      summaryLogId,
      summaryLogUri,
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
}

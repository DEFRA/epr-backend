import { transformFromSummaryLog } from './transform-from-summary-log.js'
import { getRowIdField } from '#domain/summary-logs/table-metadata.js'
import { getTableSchema } from '#application/summary-logs/validations/table-schemas.js'
import { isEprMarker } from '#domain/summary-logs/markers.js'

/**
 * Converts raw rows to validated row format expected by transformFromSummaryLog
 *
 * Only called for tables with schemas, so idField is guaranteed to exist.
 *
 * @param {string} tableName - The table name
 * @param {Array<string|null>} headers - Array of header names
 * @param {Array<Array<*>>} rows - Array of raw row value arrays
 */
const convertToValidatedRows = (tableName, headers, rows) => {
  const idField = getRowIdField(tableName)

  // Build header to index map, excluding EPR markers and nulls
  const headerToIndexMap = new Map()
  for (const [index, header] of headers.entries()) {
    if (header !== null && !isEprMarker(header)) {
      headerToIndexMap.set(header, index)
    }
  }

  const idFieldIndex = headerToIndexMap.get(idField)

  for (let i = 0; i < rows.length; i++) {
    const originalRow = rows[i]
    rows[i] = {
      values: originalRow,
      rowId: String(originalRow[idFieldIndex]),
      issues: []
    }
  }
}

/**
 * Prepares parsed data by converting raw rows to validated row format
 *
 * Only processes tables that have schemas defined.
 *
 * @param {Object} parsedData - The parsed summary log data
 */
const prepareRowsForTransformation = (parsedData) => {
  for (const [tableName, tableData] of Object.entries(parsedData.data)) {
    if (!getTableSchema(tableName)) {
      continue
    }
    convertToValidatedRows(tableName, tableData.headers, tableData.rows)
  }
}

/**
 * Orchestrates the extraction, transformation, and persistence of waste records from a summary log
 *
 * @param {Object} dependencies - The service dependencies
 * @param {Object} dependencies.extractor - The summary log extractor
 * @param {Object} dependencies.wasteRecordRepository - The waste record repository
 * @returns {Function} A function that accepts a summary log and returns a Promise
 */
export const syncFromSummaryLog = (dependencies) => {
  const { extractor, wasteRecordRepository } = dependencies

  /**
   * @param {Object} summaryLog - The summary log to process
   * @param {Object} summaryLog.file - The file information
   * @param {string} summaryLog.file.id - The file ID
   * @param {string} summaryLog.file.uri - The S3 URI (e.g., s3://bucket/key)
   * @param {string} summaryLog.organisationId - The organisation ID
   * @param {string} summaryLog.registrationId - The registration ID
   * @param {string} [summaryLog.accreditationId] - Optional accreditation ID
   * @returns {Promise<void>}
   */
  return async (summaryLog) => {
    // 1. Extract/parse the summary log
    const parsedData = await extractor.extract(summaryLog)

    // 2. Convert raw rows to validated row format
    prepareRowsForTransformation(parsedData)

    // 3. Load all existing waste records for this org/reg
    const existingRecordsArray = await wasteRecordRepository.findByRegistration(
      summaryLog.organisationId,
      summaryLog.registrationId
    )

    // 4. Convert to Map keyed by type:rowId for efficient lookup
    const existingRecords = new Map(
      existingRecordsArray.map((record) => [
        `${record.type}:${record.rowId}`,
        record
      ])
    )

    // 5. Transform to waste records
    const summaryLogContext = {
      summaryLog: {
        id: summaryLog.file.id,
        uri: summaryLog.file.uri
      },
      organisationId: summaryLog.organisationId,
      registrationId: summaryLog.registrationId,
      accreditationId: summaryLog.accreditationId
    }

    const wasteRecords = transformFromSummaryLog(
      parsedData,
      summaryLogContext,
      existingRecords
    )

    // 6. Convert waste records to wasteRecordVersions Map structure
    const wasteRecordVersions = new Map()
    for (const { record } of wasteRecords) {
      if (!wasteRecordVersions.has(record.type)) {
        wasteRecordVersions.set(record.type, new Map())
      }

      // Get the latest version (last in array) and its data
      const latestVersion = record.versions[record.versions.length - 1]
      wasteRecordVersions.get(record.type).set(record.rowId, {
        version: latestVersion,
        data: record.data
      })
    }

    // 7. Append versions
    await wasteRecordRepository.appendVersions(
      summaryLog.organisationId,
      summaryLog.registrationId,
      wasteRecordVersions
    )
  }
}

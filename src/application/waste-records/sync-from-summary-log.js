import { transformFromSummaryLog } from './transform-from-summary-log.js'
import { validateDataSyntax } from '#application/summary-logs/validations/data-syntax.js'

/**
 * Filters validated data to only include rows without validation errors
 *
 * @param {Object} validatedData - Data from validateDataSyntax with rows as { values, rowId, issues }
 * @returns {Object} Filtered data with only valid rows
 */
const filterValidRows = (validatedData) => {
  const filteredData = {}

  for (const [tableName, tableData] of Object.entries(validatedData.data)) {
    const validRows = tableData.rows?.filter(
      (row) => !row.issues || row.issues.length === 0
    )

    filteredData[tableName] = {
      ...tableData,
      rows: validRows ?? tableData.rows
    }
  }

  return {
    ...validatedData,
    data: filteredData
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
    // Capture timestamp at start of submission for consistent versioning
    const timestamp = new Date().toISOString()

    // 1. Extract/parse the summary log
    const parsedData = await extractor.extract(summaryLog)

    // 2. Validate data syntax and filter to only valid rows
    const { issues, validatedData } = validateDataSyntax({ parsed: parsedData })

    if (issues.isFatal()) {
      throw new Error('Validation failed with fatal errors during submission')
    }

    const preparedData = filterValidRows(validatedData)

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
      accreditationId: summaryLog.accreditationId,
      timestamp
    }

    const wasteRecords = transformFromSummaryLog(
      preparedData,
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

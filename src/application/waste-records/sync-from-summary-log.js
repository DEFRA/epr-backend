import { transformFromSummaryLog } from './transform-from-summary-log.js'

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
   * @param {Object} summaryLog.file.s3 - The S3 location
   * @param {string} summaryLog.file.s3.bucket - The S3 bucket name
   * @param {string} summaryLog.file.s3.key - The S3 object key
   * @param {string} summaryLog.organisationId - The organisation ID
   * @param {string} summaryLog.registrationId - The registration ID
   * @param {string} [summaryLog.accreditationId] - Optional accreditation ID
   * @returns {Promise<void>}
   */
  return async (summaryLog) => {
    // 1. Extract/parse the summary log
    const parsedData = await extractor.extract(summaryLog)

    // 2. Load all existing waste records for this org/reg
    const existingRecordsArray = await wasteRecordRepository.findByRegistration(
      summaryLog.organisationId,
      summaryLog.registrationId
    )

    // 3. Convert to Map keyed by type:rowId for efficient lookup
    const existingRecords = new Map(
      existingRecordsArray.map((record) => [
        `${record.type}:${record.rowId}`,
        record
      ])
    )

    // 4. Transform to waste records
    const summaryLogContext = {
      summaryLog: {
        id: summaryLog.file.id,
        uri: `s3://${summaryLog.file.s3.bucket}/${summaryLog.file.s3.key}`
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

    // 5. Save waste records
    await wasteRecordRepository.upsertWasteRecords(wasteRecords)
  }
}

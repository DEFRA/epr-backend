import { transformFromSummaryLog } from './transform-from-summary-log.js'

/**
 * Orchestrates the extraction, transformation, and persistence of waste records from a summary log
 *
 * @param {Object} summaryLog - The summary log to process
 * @param {string} summaryLog.id - The summary log ID
 * @param {string} summaryLog.uri - The S3 URI for the summary log
 * @param {string} summaryLog.organisationId - The organisation ID
 * @param {string} summaryLog.registrationId - The registration ID
 * @param {string} [summaryLog.accreditationId] - Optional accreditation ID
 * @param {Object} dependencies - The service dependencies
 * @param {Object} dependencies.extractor - The summary log extractor
 * @param {Object} dependencies.wasteRecordRepository - The waste record repository
 * @returns {Promise<void>}
 */
export const syncFromSummaryLog = async (summaryLog, dependencies) => {
  const { extractor, wasteRecordRepository } = dependencies

  // 1. Extract/parse the summary log
  const parsedData = await extractor.extract(summaryLog.uri)

  // 2. Transform to waste records
  const summaryLogContext = {
    summaryLogId: summaryLog.id,
    summaryLogUri: summaryLog.uri,
    organisationId: summaryLog.organisationId,
    registrationId: summaryLog.registrationId,
    accreditationId: summaryLog.accreditationId
  }

  const wasteRecords = await transformFromSummaryLog(
    parsedData,
    summaryLogContext,
    wasteRecordRepository.findByCompositeKey
  )

  // 3. Save waste records
  await wasteRecordRepository.saveAll(wasteRecords)
}

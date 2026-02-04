import {
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'

/**
 * @typedef {object} SubmitDependencies
 * @property {object} logger
 * @property {object} summaryLogsRepository
 * @property {object} organisationsRepository
 * @property {object} wasteRecordsRepository
 * @property {object} wasteBalancesRepository
 * @property {object} summaryLogExtractor
 * @property {object} [user]
 */

/**
 * Submits a summary log by syncing its waste records and updating status.
 *
 * @param {string} summaryLogId
 * @param {SubmitDependencies} deps
 * @returns {Promise<void>}
 */
export const submitSummaryLog = async (summaryLogId, deps) => {
  const {
    logger,
    summaryLogsRepository,
    organisationsRepository,
    wasteRecordsRepository,
    wasteBalancesRepository,
    summaryLogExtractor,
    user
  } = deps

  const existing = await summaryLogsRepository.findById(summaryLogId)

  if (!existing) {
    throw new Error(`Summary log ${summaryLogId} not found`)
  }

  const { version, summaryLog } = existing

  if (summaryLog.status !== SUMMARY_LOG_STATUS.SUBMITTING) {
    throw new Error(
      `Summary log must be in submitting status. Current status: ${summaryLog.status}`
    )
  }

  const processingType =
    summaryLog.meta?.[SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]

  const sync = syncFromSummaryLog({
    extractor: summaryLogExtractor,
    wasteRecordRepository: wasteRecordsRepository,
    wasteBalancesRepository,
    organisationsRepository
  })

  const { created, updated } = await summaryLogMetrics.timedSubmission(
    { processingType },
    () => sync(summaryLog, user)
  )

  await summaryLogMetrics.recordWasteRecordsCreated({ processingType }, created)
  await summaryLogMetrics.recordWasteRecordsUpdated({ processingType }, updated)

  await summaryLogsRepository.update(
    summaryLogId,
    version,
    transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)
  )

  await summaryLogMetrics.recordStatusTransition({
    status: SUMMARY_LOG_STATUS.SUBMITTED,
    processingType
  })

  logger.info({
    message: `Summary log submitted: summaryLogId=${summaryLogId}`
  })
}

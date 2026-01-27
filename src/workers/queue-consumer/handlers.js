import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'
import {
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'

/**
 * Creates command handlers for the queue consumer.
 *
 * @param {object} options
 * @param {object} options.logger - Pino logger instance
 * @param {object} options.repositories - Injected repositories
 * @param {object} options.repositories.summaryLogsRepository
 * @param {object} options.repositories.organisationsRepository
 * @param {object} options.repositories.wasteRecordsRepository
 * @param {object} options.repositories.wasteBalancesRepository
 * @param {object} options.repositories.summaryLogExtractor
 * @param {object} options.repositories.featureFlags
 * @returns {object} Object with handleValidateCommand and handleSubmitCommand functions
 */
export function createCommandHandlers({ logger, repositories }) {
  const {
    summaryLogsRepository,
    organisationsRepository,
    wasteRecordsRepository,
    wasteBalancesRepository,
    summaryLogExtractor,
    featureFlags
  } = repositories

  const handleValidateCommand = async ({ summaryLogId }) => {
    const validateSummaryLog = createSummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      wasteRecordsRepository,
      summaryLogExtractor
    })

    await validateSummaryLog(summaryLogId)
  }

  const handleSubmitCommand = async ({ summaryLogId }) => {
    // Load the summary log
    const existing = await summaryLogsRepository.findById(summaryLogId)

    if (!existing) {
      throw new Error(`Summary log ${summaryLogId} not found`)
    }

    const { version, summaryLog } = existing

    // Verify status is SUBMITTING
    if (summaryLog.status !== SUMMARY_LOG_STATUS.SUBMITTING) {
      throw new Error(
        `Summary log must be in submitting status. Current status: ${summaryLog.status}`
      )
    }

    const processingType =
      summaryLog.meta?.[SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]

    // Sync waste records from summary log
    const sync = syncFromSummaryLog({
      extractor: summaryLogExtractor,
      wasteRecordRepository: wasteRecordsRepository,
      wasteBalancesRepository,
      organisationsRepository,
      featureFlags
    })

    const { created, updated } = await summaryLogMetrics.timedSubmission(
      { processingType },
      () => sync(summaryLog)
    )

    // Record submission metrics
    await summaryLogMetrics.recordWasteRecordsCreated(
      { processingType },
      created
    )
    await summaryLogMetrics.recordWasteRecordsUpdated(
      { processingType },
      updated
    )

    // Update status to SUBMITTED
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

  return {
    handleValidateCommand,
    handleSubmitCommand
  }
}

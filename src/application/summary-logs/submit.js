import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { PermanentError } from '#server/queue-consumer/permanent-error.js'
import { SUMMARY_LOG_META_FIELDS } from '#domain/summary-logs/meta-fields.js'
import { syncFromSummaryLog } from '#application/waste-records/sync-from-summary-log.js'
import { summaryLogMetrics } from '#common/helpers/metrics/summary-logs.js'

/**
 * @import { OnSummaryLogUploaded } from '#reports/application/summary-log-events.js'
 */

/**
 * @typedef {object} SubmitDependencies
 * @property {object} logger
 * @property {object} summaryLogsRepository
 * @property {object} organisationsRepository
 * @property {object} wasteRecordsRepository
 * @property {import('#waste-records/repository/port.js').RowStateRepository} wasteRecordStatesRepository
 * @property {ReturnType<typeof import('#waste-balances/application/waste-balance-service.js').createWasteBalanceService>} wasteBalanceService
 * @property {import('#feature-flags/feature-flags.port.js').FeatureFlags} featureFlags
 * @property {object} summaryLogExtractor
 * @property {import('#overseas-sites/repository/port.js').OverseasSitesRepository} overseasSitesRepository
 * @property {import('#domain/summary-logs/worker/port.js').SubmitUser} user
 * @property {OnSummaryLogUploaded} onSummaryLogUploaded
 */

/**
 * Loads the summary log and asserts it is in the SUBMITTING state, throwing a
 * PermanentError if it is missing or in any other state.
 *
 * @param {SubmitDependencies['summaryLogsRepository']} summaryLogsRepository
 * @param {string} summaryLogId
 */
const loadSubmittingSummaryLog = async (
  summaryLogsRepository,
  summaryLogId
) => {
  const existing = await summaryLogsRepository.findById(summaryLogId)

  if (!existing) {
    throw new PermanentError(`Summary log ${summaryLogId} not found`)
  }

  if (existing.summaryLog.status !== SUMMARY_LOG_STATUS.SUBMITTING) {
    throw new PermanentError(
      `Summary log must be in submitting status. Current status: ${existing.summaryLog.status}`
    )
  }

  return existing
}

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
    wasteRecordStatesRepository,
    wasteBalanceService,
    featureFlags,
    summaryLogExtractor,
    overseasSitesRepository,
    user,
    onSummaryLogUploaded
  } = deps

  const { version, summaryLog } = await loadSubmittingSummaryLog(
    summaryLogsRepository,
    summaryLogId
  )

  const {
    file: { id: fileId, name: filename }
  } = summaryLog

  const loggingContext = `summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}`

  const processingType =
    summaryLog.meta?.[SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]

  logger.info({
    message: `Summary log submission started: ${loggingContext}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.START_SUCCESS
    }
  })

  const sync = syncFromSummaryLog({
    extractor: summaryLogExtractor,
    wasteRecordRepository: wasteRecordsRepository,
    wasteBalanceService,
    organisationsRepository,
    overseasSitesRepository,
    rowStateRepository: wasteRecordStatesRepository,
    featureFlags,
    logger
  })

  const { created, updated } = await summaryLogMetrics.timedSubmission(
    { processingType },
    () => sync(summaryLog, user)
  )

  await summaryLogMetrics.recordWasteRecordsCreated({ processingType }, created)
  await summaryLogMetrics.recordWasteRecordsUpdated({ processingType }, updated)

  await onSummaryLogUploaded({
    organisationId: summaryLog.organisationId,
    registrationId: summaryLog.registrationId,
    summaryLogId,
    closedPeriods: summaryLog.loadsByReportingPeriod?.closedPeriods ?? []
  })

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
    message: `Summary log submitted: ${loggingContext}, created=${created}, updated=${updated}`,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.PROCESS_SUCCESS
    }
  })
}

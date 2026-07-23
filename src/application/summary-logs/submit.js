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
 * @import { TypedLogger } from '#common/hapi-types.js'
 * @import { SummaryLogExtractor } from '#domain/summary-logs/extractor/port.js'
 * @import { SummaryLog } from '#domain/summary-logs/model.js'
 * @import { SubmitUser } from '#domain/summary-logs/worker/port.js'
 * @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js'
 * @import { ReportsService } from '#reports/application/report-service.js'
 * @import { OnSummaryLogUploaded } from '#reports/application/summary-log-events.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js'
 * @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js'
 * @import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
 * @import { SummaryLogRowStateRepository } from '#waste-records/repository/port.js'
 */

/**
 * @typedef {object} SubmitDependencies
 * @property {TypedLogger} logger
 * @property {SummaryLogsRepository} summaryLogsRepository
 * @property {OrganisationsRepository} organisationsRepository
 * @property {SummaryLogRowStateRepository} summaryLogRowStatesRepository
 * @property {WasteBalanceLedgerRepository} ledgerRepository
 * @property {ReturnType<typeof createWasteBalanceService>} wasteBalanceService
 * @property {ReportsService} reportsService
 * @property {SummaryLogExtractor} summaryLogExtractor
 * @property {OverseasSitesRepository} overseasSitesRepository
 * @property {SubmitUser} user
 * @property {OnSummaryLogUploaded} onSummaryLogUploaded
 */

/**
 * A summary log that has reached SUBMITTING status: validation has linked it to a
 * registration and stamped its creation time, so these fields are always present.
 * @typedef {SummaryLog & {
 *   createdAt: string
 *   organisationId: string
 *   registrationId: string
 * }} SubmittableSummaryLog
 */

/**
 * Fails submission if any report for this registration was submitted since the
 * log's createdAt, closing the validate-to-submit race where a period closes
 * after the operator confirmed the preview. Deliberately blunt: it fires on any
 * submission, not only periods this log touches. See PAE-1686.
 *
 * @param {SubmittableSummaryLog} summaryLog
 * @param {string} summaryLogId
 * @param {ReportsService} reportsService
 * @returns {Promise<void>}
 */
const assertNoReportSubmittedSinceCreation = async (
  summaryLog,
  summaryLogId,
  reportsService
) => {
  const reportSubmittedSinceCreation =
    await reportsService.hasReportSubmittedSince(
      summaryLog.organisationId,
      summaryLog.registrationId,
      summaryLog.createdAt
    )

  if (reportSubmittedSinceCreation) {
    throw new PermanentError(
      `Summary log ${summaryLogId} is stale: a report was submitted for this registration after the summary log was created`
    )
  }
}

/**
 * Syncs the summary log's waste records, transitions it to SUBMITTED and records
 * the submission metrics.
 *
 * @param {string} summaryLogId
 * @param {number} version
 * @param {SubmittableSummaryLog} summaryLog
 * @param {SubmitDependencies} deps
 * @returns {Promise<void>}
 */
const syncAndFinalise = async (summaryLogId, version, summaryLog, deps) => {
  const {
    logger,
    summaryLogsRepository,
    organisationsRepository,
    summaryLogRowStatesRepository,
    ledgerRepository,
    wasteBalanceService,
    summaryLogExtractor,
    overseasSitesRepository,
    user,
    onSummaryLogUploaded
  } = deps

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
    wasteBalanceService,
    organisationsRepository,
    overseasSitesRepository,
    summaryLogRowStateRepository: summaryLogRowStatesRepository,
    ledgerRepository,
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

/**
 * Submits a summary log by syncing its waste records and updating status.
 *
 * @param {string} summaryLogId
 * @param {SubmitDependencies} deps
 * @returns {Promise<void>}
 */
export const submitSummaryLog = async (summaryLogId, deps) => {
  const { summaryLogsRepository, reportsService } = deps

  const existing = await summaryLogsRepository.findById(summaryLogId)

  if (!existing) {
    throw new PermanentError(`Summary log ${summaryLogId} not found`)
  }

  const { version, summaryLog } = existing

  if (summaryLog.status !== SUMMARY_LOG_STATUS.SUBMITTING) {
    throw new PermanentError(
      `Summary log must be in submitting status. Current status: ${summaryLog.status}`
    )
  }

  const submittableLog = /** @type {SubmittableSummaryLog} */ (summaryLog)

  await assertNoReportSubmittedSinceCreation(
    submittableLog,
    summaryLogId,
    reportsService
  )

  await syncAndFinalise(summaryLogId, version, submittableLog, deps)
}

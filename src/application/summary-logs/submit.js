/** @import {SummaryLogId} from '#domain/summary-logs/ids.js' */
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
import { summaryLogMetrics } from '#application/summary-logs/metrics.js'

/**
 * @import { TypedLogger } from '#common/hapi-types.js'
 * @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js'
 * @import { SummaryLogExtractor } from '#domain/summary-logs/extractor/port.js'
 * @import { SummaryLog } from '#domain/summary-logs/model.js'
 * @import { SubmitUser } from '#domain/summary-logs/worker/port.js'
 * @import { ReportsService } from '#reports/application/report-service.js'
 * @import { OnSummaryLogUploaded } from '#reports/application/summary-log-events.js'
 * @import { OrganisationReadRepository } from '#organisation-read-model/repository/port.js'
 * @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js'
 * @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js'
 * @import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
 * @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js'
 */

/**
 * @typedef {object} SubmitDependencies
 * @property {TypedLogger} logger
 * @property {SummaryLogsRepository} summaryLogsRepository
 * @property {OrganisationReadRepository} organisationReadRepository
 * @property {SummaryLogRowStatesRepository} summaryLogRowStatesRepository
 * @property {WasteBalanceLedgerRepository} ledgerRepository
 * @property {ReturnType<typeof createWasteBalanceService>} wasteBalanceService
 * @property {ReportsService} reportsService
 * @property {SummaryLogExtractor} summaryLogExtractor
 * @property {SubmitUser} user
 * @property {OnSummaryLogUploaded} onSummaryLogUploaded
 */

/**
 * A summary log that has reached SUBMITTING status: validation has linked it to a
 * registration and stamped its creation time, and it cannot reach SUBMITTING
 * without its numbers, so these fields are always present.
 * @typedef {SummaryLog & {
 *   createdAt: string
 *   organisationId: string
 *   registrationId: string
 *   organisationNumber: OrganisationNumber
 *   registrationNumber: RegistrationNumber
 * }} SubmittableSummaryLog
 */

/**
 * Fails submission if any report for this registration and the log's year was
 * submitted since the log's createdAt, closing the validate-to-submit race
 * where a period closes after the operator confirmed the preview. Deliberately
 * blunt within the year: it fires on any submission, not only periods this log
 * touches.
 *
 * @param {SubmittableSummaryLog} summaryLog
 * @param {SummaryLogId} summaryLogId
 * @param {ReportsService} reportsService
 * @returns {Promise<void>}
 */
const assertNoReportSubmittedSinceCreation = async (
  summaryLog,
  summaryLogId,
  reportsService
) => {
  const reportSubmittedSinceCreation =
    await reportsService.hasReportSubmittedSince({
      organisationNumber: summaryLog.organisationNumber,
      registrationNumber: summaryLog.registrationNumber,
      year: summaryLog.year,
      since: summaryLog.createdAt
    })

  if (reportSubmittedSinceCreation) {
    throw new PermanentError(
      `Summary log ${summaryLogId} is stale: a report was submitted for this registration and year after the summary log was created`
    )
  }
}

/**
 * Syncs the summary log's waste records, transitions it to SUBMITTED and records
 * the submission metrics.
 *
 * @param {SummaryLogId} summaryLogId
 * @param {number} version
 * @param {SubmittableSummaryLog} summaryLog
 * @param {SubmitDependencies} deps
 * @returns {Promise<void>}
 */
const syncAndFinalise = async (summaryLogId, version, summaryLog, deps) => {
  const {
    logger,
    summaryLogsRepository,
    organisationReadRepository,
    summaryLogRowStatesRepository,
    ledgerRepository,
    wasteBalanceService,
    summaryLogExtractor,
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
    organisationReadRepository,
    summaryLogRowStatesRepository,
    ledgerRepository,
    logger
  })

  const { created, updated, decemberWasteRowCount } =
    await summaryLogMetrics.timedSubmission({ processingType }, () =>
      sync(summaryLog, user)
    )

  await summaryLogMetrics.recordWasteRecordsCreated({ processingType }, created)
  await summaryLogMetrics.recordWasteRecordsUpdated({ processingType }, updated)
  await summaryLogMetrics.recordDecemberWasteRows(
    { processingType },
    decemberWasteRowCount
  )

  await onSummaryLogUploaded({
    organisationNumber: summaryLog.organisationNumber,
    registrationNumber: summaryLog.registrationNumber,
    year: summaryLog.year,
    summaryLogId: fileId,
    periodsRequiringResubmission:
      summaryLog.loadsByReportingPeriod?.periodsRequiringResubmission ??
      summaryLog.loadsByReportingPeriod?.closedPeriods ??
      []
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
 * @param {SummaryLogId} summaryLogId
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

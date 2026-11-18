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
import { summaryLogMetrics } from '#application/summary-logs/metrics.js'
import { toLedgerUser } from '#waste-balances/application/ledger-user.js'
import { pickLedgerId } from '#waste-balances/repository/ledger-schema.js'
import { supersedeIfStale } from './supersede-if-stale.js'

/**
 * @import { TypedLogger } from '#common/hapi-types.js'
 * @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js'
 * @import { SummaryLogCommit } from '#domain/summary-logs/commit.js'
 * @import { SummaryLog } from '#domain/summary-logs/model.js'
 * @import { SubmitUser } from '#domain/summary-logs/worker/port.js'
 * @import { ReportsService } from '#reports/application/report-service.js'
 * @import { OnSummaryLogUploaded } from '#reports/application/summary-log-events.js'
 * @import { OrganisationReadRepository } from '#organisation-read-model/index.js'
 * @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js'
 * @import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
 */

/**
 * @typedef {object} SubmitDependencies
 * @property {TypedLogger} logger
 * @property {SummaryLogsRepository} summaryLogsRepository
 * @property {OrganisationReadRepository} organisationReadRepository
 * @property {ReturnType<typeof createWasteBalanceService>} wasteBalanceService
 * @property {ReportsService} reportsService
 * @property {SubmitUser} user
 * @property {OnSummaryLogUploaded} onSummaryLogUploaded
 */

/**
 * A summary log that has reached SUBMITTING status: validation has linked it to a
 * registration and stamped its creation time, and it cannot reach SUBMITTING
 * without its numbers, so these fields are always present.
 * @typedef {SummaryLog & {
 *   createdAt: string
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
 * @param {SubmittableSummaryLog} summaryLog
 * @param {SummaryLogCommit} commit
 * @param {SubmitDependencies} deps
 * @returns {Promise<void>}
 */
const appendSubmittedEvent = async (
  summaryLog,
  { payload },
  { wasteBalanceService, user }
) => {
  const ledgerId = pickLedgerId(summaryLog)
  const summaryLogId = summaryLog.file.id

  if (ledgerId.accreditationNumber === null) {
    await wasteBalanceService.commitSummaryLogSubmittedEvent(
      ledgerId,
      { summaryLogId, ...payload },
      toLedgerUser(user)
    )
    return
  }

  await wasteBalanceService.submitSummaryLog({
    ledgerId,
    summaryLogId,
    totals: payload,
    user
  })
}

/**
 * Appends the summary-log-submitted event validation worked out, transitions
 * the summary log to SUBMITTED and records the submission metrics.
 *
 * @param {SummaryLogId} summaryLogId
 * @param {number} version
 * @param {SubmittableSummaryLog} summaryLog
 * @param {SummaryLogCommit} commit
 * @param {SubmitDependencies} deps
 * @returns {Promise<void>}
 */
const commitAndFinalise = async (
  summaryLogId,
  version,
  summaryLog,
  commit,
  deps
) => {
  const { logger, summaryLogsRepository, onSummaryLogUploaded } = deps
  const { created, updated, decemberWasteRowCount } = commit.counts

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

  await summaryLogMetrics.timedSubmission({ processingType }, () =>
    appendSubmittedEvent(summaryLog, commit, deps)
  )

  await summaryLogMetrics.recordWasteRecordsCreated({ processingType }, created)
  await summaryLogMetrics.recordWasteRecordsUpdated({ processingType }, updated)
  await summaryLogMetrics.recordDecemberWasteRows(
    { processingType },
    decemberWasteRowCount
  )

  await summaryLogsRepository.update(
    summaryLogId,
    version,
    transitionStatus(summaryLog, SUMMARY_LOG_STATUS.SUBMITTED)
  )

  await onSummaryLogUploaded({
    organisationNumber: summaryLog.organisationNumber,
    registrationNumber: summaryLog.registrationNumber,
    year: summaryLog.year,
    summaryLogId: fileId,
    periodsRequiringResubmission:
      summaryLog.loadsByReportingPeriod?.periodsRequiringResubmission ?? []
  })

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
 * Submits a validated summary log by committing what validation saved, or
 * supersedes it when that can no longer be committed as validated.
 *
 * @param {SummaryLogId} summaryLogId
 * @param {SubmitDependencies} deps
 * @returns {Promise<void>}
 */
export const submitSummaryLog = async (summaryLogId, deps) => {
  const {
    logger,
    summaryLogsRepository,
    organisationReadRepository,
    reportsService
  } = deps

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

  const { commit } = await supersedeIfStale({
    summaryLogsRepository,
    organisationReadRepository,
    logger,
    summaryLog,
    summaryLogId,
    version
  })
  if (!commit) {
    return
  }

  await commitAndFinalise(summaryLogId, version, submittableLog, commit, deps)
}

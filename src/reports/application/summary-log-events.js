/** @import {SummaryLogFileId} from '#domain/summary-logs/ids.js' */
import { logger } from '#common/helpers/logging/logger.js'
import {
  auditMarkReportsStale,
  auditMarkReportsRequiringResubmission,
  MARK_STALE_ACTION
} from '#reports/application/audit.js'

/**
 * @import { PeriodRef } from '#reports/domain/period-key.js'
 * @import { RegistrationKey, ReportsRepository } from '#reports/repository/port.js'
 * @import { SystemLogsRepository } from '#repositories/system-logs/port.js'
 */

/**
 * @typedef {{
 *   reportsRepository: ReportsRepository,
 *   systemLogsRepository: SystemLogsRepository
 * }} SummaryLogUploadedRepositories
 *
 * @typedef {RegistrationKey & {
 *   summaryLogId: SummaryLogFileId,
 *   periodsRequiringResubmission?: PeriodRef[]
 * }} SummaryLogUploadedParams
 *
 * @typedef {(params: SummaryLogUploadedParams) => Promise<void>} OnSummaryLogUploaded
 */

/**
 * Builds the summary-log-uploaded handler, closing over the repositories that
 * stay fixed for the server's lifetime. The returned handler is called after a
 * new summary log is successfully submitted for an org/reg: it marks all active
 * (in_progress / ready_to_submit) reports as stale, and flags the latest
 * submitted report of each period in periodsRequiringResubmission as requiring
 * resubmission. Audits each batch in a single call.
 *
 * @param {SummaryLogUploadedRepositories} repositories
 * @returns {OnSummaryLogUploaded}
 */
export const createOnSummaryLogUploaded =
  ({ reportsRepository, systemLogsRepository }) =>
  async ({
    organisationNumber,
    registrationNumber,
    summaryLogId,
    periodsRequiringResubmission = []
  }) => {
    const uploadedAt = new Date().toISOString()

    logger.info({
      message: `Summary log uploaded, marking reports stale for ${organisationNumber}/${registrationNumber}: fileId=${summaryLogId}`
    })

    const reportsMarkedStale =
      await reportsRepository.markActiveReportsStaleForSummaryLog(
        organisationNumber,
        registrationNumber,
        summaryLogId,
        uploadedAt
      )

    if (reportsMarkedStale.length > 0) {
      logger.info({
        message: `Reports marked as stale for ${organisationNumber}/${registrationNumber} fileId=${summaryLogId}: ${reportsMarkedStale.map((r) => r.reportId).join(', ')}`
      })

      await auditMarkReportsStale({
        systemLogsRepository,
        organisationNumber,
        registrationNumber,
        reportsMarkedStale,
        action: MARK_STALE_ACTION.SUMMARY_LOG_CHANGED
      })
    } else {
      logger.info({
        message: `No active report marked stale for ${organisationNumber}/${registrationNumber} fileId=${summaryLogId} (none active, or already flagged by an earlier trigger)`
      })
    }

    const reportsRequiringResubmission =
      await reportsRepository.markSubmittedReportsRequiringResubmission({
        organisationNumber,
        registrationNumber,
        summaryLogId,
        uploadedAt,
        periods: periodsRequiringResubmission
      })

    if (reportsRequiringResubmission.length > 0) {
      logger.info({
        message: `Reports flagged requiring resubmission for ${organisationNumber}/${registrationNumber} fileId=${summaryLogId}: ${reportsRequiringResubmission.map((r) => r.reportId).join(', ')}`
      })

      await auditMarkReportsRequiringResubmission({
        systemLogsRepository,
        organisationNumber,
        registrationNumber,
        reportsRequiringResubmission
      })
    }
  }

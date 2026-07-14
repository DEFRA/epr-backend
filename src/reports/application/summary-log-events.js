import { isClosedPeriodAdjustmentsEnabled } from '#root/config.js'
import { logger } from '#common/helpers/logging/logger.js'
import {
  auditMarkReportsStale,
  auditMarkReportsRequiringResubmission,
  MARK_STALE_ACTION
} from '#reports/application/audit.js'

/**
 * @import { PeriodRef } from '#reports/domain/period-key.js'
 * @import { ReportsRepository } from '#reports/repository/port.js'
 * @import { SystemLogsRepository } from '#repositories/system-logs/port.js'
 */

/**
 * @typedef {{
 *   reportsRepository: ReportsRepository,
 *   systemLogsRepository: SystemLogsRepository
 * }} SummaryLogUploadedRepositories
 *
 * @typedef {{
 *   organisationId: string,
 *   registrationId: string,
 *   summaryLogId: string,
 *   closedPeriods?: PeriodRef[]
 * }} SummaryLogUploadedParams
 *
 * @typedef {(params: SummaryLogUploadedParams) => Promise<void>} OnSummaryLogUploaded
 */

/**
 * Builds the summary-log-uploaded handler, closing over the repositories that
 * stay fixed for the server's lifetime. The returned handler is called after a
 * new summary log is successfully submitted for an org/reg: it marks all active
 * (in_progress / ready_to_submit) reports as stale, and flags the latest
 * submitted report of each closed period the upload restated as requiring
 * resubmission. Audits each batch in a single call.
 *
 * @param {SummaryLogUploadedRepositories} repositories
 * @returns {OnSummaryLogUploaded}
 */
export const createOnSummaryLogUploaded =
  ({ reportsRepository, systemLogsRepository }) =>
  async ({
    organisationId,
    registrationId,
    summaryLogId,
    closedPeriods = []
  }) => {
    const uploadedAt = new Date().toISOString()

    const reportsMarkedStale =
      await reportsRepository.markActiveReportsStaleForSummaryLog(
        organisationId,
        registrationId,
        summaryLogId,
        uploadedAt
      )

    if (reportsMarkedStale.length > 0) {
      logger.info({
        message: `Reports marked as stale: ${reportsMarkedStale.map((r) => r.reportId).join(', ')}`
      })

      await auditMarkReportsStale({
        systemLogsRepository,
        organisationId,
        registrationId,
        reportsMarkedStale,
        action: MARK_STALE_ACTION.SUMMARY_LOG_CHANGED
      })
    }

    if (!isClosedPeriodAdjustmentsEnabled()) {
      return
    }

    const reportsRequiringResubmission =
      await reportsRepository.markSubmittedReportsRequiringResubmission({
        organisationId,
        registrationId,
        summaryLogId,
        uploadedAt,
        periods: closedPeriods
      })

    if (reportsRequiringResubmission.length > 0) {
      logger.info({
        message: `Reports flagged requiring resubmission: ${reportsRequiringResubmission.map((r) => r.reportId).join(', ')}`
      })

      await auditMarkReportsRequiringResubmission({
        systemLogsRepository,
        organisationId,
        registrationId,
        reportsRequiringResubmission
      })
    }
  }

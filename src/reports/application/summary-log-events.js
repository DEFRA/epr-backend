import { logger } from '#common/helpers/logging/logger.js'
import {
  auditMarkReportsStale,
  auditMarkReportsRequiringResubmission
} from '#reports/application/audit.js'

/**
 * @import { PeriodRef } from '#reports/domain/period-key.js'
 */

/**
 * Called after a new summary log is successfully submitted for an org/reg.
 * Marks all active (in_progress / ready_to_submit) reports as stale, and flags
 * the latest submitted report of each closed period the upload restated as
 * requiring resubmission. Audits each batch in a single call.
 *
 * @param {{
 *   organisationId: string,
 *   registrationId: string,
 *   summaryLogId: string,
 *   closedPeriods?: PeriodRef[],
 *   reportsRepository: import('#reports/repository/port.js').ReportsRepository,
 *   systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository
 * }} params
 * @returns {Promise<void>}
 */
export async function onSummaryLogUploaded({
  organisationId,
  registrationId,
  summaryLogId,
  closedPeriods = [],
  reportsRepository,
  systemLogsRepository
}) {
  const uploadedAt = new Date().toISOString()

  const reportsMarkedStale = await reportsRepository.markActiveReportsStale(
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
      reportsMarkedStale
    })
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

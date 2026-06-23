import { logger } from '#common/helpers/logging/logger.js'
import { auditMarkReportsStale } from '#reports/application/audit.js'

/**
 * Called after a new summary log is successfully submitted for an org/reg.
 * Bulk-marks all active (in_progress / ready_to_submit) reports as stale
 * and audits the changes in a single batch.
 *
 * @param {{
 *   organisationId: string,
 *   registrationId: string,
 *   summaryLogId: string,
 *   reportsRepository: import('#reports/repository/port.js').ReportsRepository,
 *   systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository
 * }} params
 * @returns {Promise<void>}
 */
export async function onSummaryLogUploaded({
  organisationId,
  registrationId,
  summaryLogId,
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
}

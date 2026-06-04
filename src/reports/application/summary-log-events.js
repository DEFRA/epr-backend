import { STALE_REASON } from '#reports/domain/stale.js'
import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { auditMarkReportStale } from '#reports/application/audit.js'

/**
 * Called after a new summary log is successfully submitted for an org/reg.
 * Marks all in-progress/ready-to-submit reports as stale and audits each change.
 *
 * @param {{
 *   organisationId: string,
 *   registrationId: string,
 *   reportsRepository: import('#reports/repository/port.js').ReportsRepository,
 *   systemLogsRepository: import('#repositories/system-logs/port.js').SystemLogsRepository
 * }} params
 * @returns {Promise<void>}
 */
export async function onSummaryLogUploaded({
  organisationId,
  registrationId,
  reportsRepository,
  systemLogsRepository
}) {
  const reports = await reportsRepository.findReportsByStatus(
    organisationId,
    registrationId,
    [REPORT_STATUS.IN_PROGRESS, REPORT_STATUS.READY_TO_SUBMIT]
  )

  const now = new Date().toISOString()
  const stale = { at: now, reason: STALE_REASON.SUMMARY_LOG_CHANGED }

  for (const report of reports) {
    const updated = await reportsRepository.markReportStale(
      report.id,
      report.version,
      stale
    )

    await auditMarkReportStale({
      systemLogsRepository,
      organisationId,
      registrationId,
      year: report.year,
      cadence: report.cadence,
      period: report.period,
      submissionNumber: report.submissionNumber,
      reportId: report.id,
      previous: report,
      next: updated
    })
  }
}

import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { buildSubmittedReport } from './build-submitted-report.js'

const SUBMITTER = { id: 'user-1', name: 'Jane Smith', position: 'Officer' }

/**
 * Creates a report, submits it, then unsubmits it (back to ready_to_submit).
 *
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @param {Partial<import('#reports/repository/port.js').CreateReportParams>} [overrides]
 * @returns {Promise<string>} the report id
 */
export async function buildUnsubmittedReport(
  reportsRepository,
  overrides = {}
) {
  const id = await buildSubmittedReport(reportsRepository, overrides)
  await reportsRepository.updateReportStatus({
    reportId: id,
    version: 3,
    status: REPORT_STATUS.READY_TO_SUBMIT,
    slot: 'unsubmitted',
    changedBy: SUBMITTER
  })
  return id
}

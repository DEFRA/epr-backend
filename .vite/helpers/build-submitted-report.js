import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'

const SUBMITTER = { id: 'user-1', name: 'Jane Smith', position: 'Officer' }

/**
 * Creates a report and advances it to submitted status via ready_to_submit.
 *
 * @param {import('#reports/repository/port.js').ReportsRepository} reportsRepository
 * @param {Partial<import('#reports/repository/port.js').CreateReportParams>} [overrides]
 * @returns {Promise<string>} the submitted report id
 */
export async function buildSubmittedReport(reportsRepository, overrides = {}) {
  const { id } = await reportsRepository.createReport(
    buildCreateReportParams({ changedBy: SUBMITTER, ...overrides })
  )
  await reportsRepository.updateReportStatus({
    reportId: id,
    version: 1,
    status: REPORT_STATUS.READY_TO_SUBMIT,
    changedBy: SUBMITTER
  })
  await reportsRepository.updateReportStatus({
    reportId: id,
    version: 2,
    status: REPORT_STATUS.SUBMITTED,
    changedBy: SUBMITTER
  })
  return id
}

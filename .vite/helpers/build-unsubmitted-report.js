import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'

const SUBMITTER = { id: 'user-1', name: 'Jane Smith', position: 'Officer' }

/**
 * Submits a report and then unsubmits it, leaving it in ready_to_submit with its
 * submitted slot (submittedAt/submittedBy) retained. Models a service maintainer
 * reverting a submitted period for correction, with no newer submission.
 *
 * The current version is read back before the unsubmit rather than assumed, so
 * this does not depend on how many status updates buildSubmittedReport performs.
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
  const { version } = await reportsRepository.findReportById(id)
  await reportsRepository.updateReportStatus({
    reportId: id,
    version,
    status: REPORT_STATUS.READY_TO_SUBMIT,
    slot: REPORT_STATUS_SLOT.UNSUBMITTED,
    changedBy: SUBMITTER
  })
  return id
}

import { REPORT_STATUS } from '#reports/domain/report-status.js'
import { validateClearClosedPeriodRestated } from './validation.js'

/**
 * Mirrors mongodb-flagging.js's conditional write, returning `null` when
 * nothing matched.
 *
 * @param {Map<string, Object>} reports
 * @param {import('./port.js').ClearClosedPeriodRestatedParams} params
 * @returns {Promise<import('./port.js').ClearClosedPeriodRestatedResult | null>}
 */
export const clearClosedPeriodRestated = async (reports, params) => {
  const { reportId, summaryLogId } = validateClearClosedPeriodRestated(params)

  const report = reports.get(reportId)
  const closedPeriodRestated =
    report?.resubmissionRequired?.closedPeriodRestated

  if (
    report?.status.currentStatus !== REPORT_STATUS.SUBMITTED ||
    closedPeriodRestated?.summaryLogId !== summaryLogId
  ) {
    return null
  }

  const { closedPeriodRestated: _cleared, ...remaining } =
    report.resubmissionRequired
  const { resubmissionRequired: _previous, ...rest } = report

  reports.set(reportId, {
    ...rest,
    ...(Object.keys(remaining).length > 0 && {
      resubmissionRequired: remaining
    }),
    version: report.version + 1
  })

  return structuredClone({
    reportId: report.id,
    year: report.year,
    cadence: report.cadence,
    period: report.period,
    submissionNumber: report.submissionNumber,
    closedPeriodRestated
  })
}

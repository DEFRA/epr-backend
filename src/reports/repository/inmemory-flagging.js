import { validateClearClosedPeriodRestated } from './validation.js'

/**
 * Mirrors mongodb-flagging.js's version-guarded write.
 *
 * @param {Map<string, Object>} reports
 * @param {import('./port.js').ClearClosedPeriodRestatedParams} params
 * @returns {Promise<boolean>}
 */
export const clearClosedPeriodRestated = async (reports, params) => {
  const { reportId, version } = validateClearClosedPeriodRestated(params)

  const report = reports.get(reportId)

  if (
    report?.version !== version ||
    !report.resubmissionRequired?.closedPeriodRestated
  ) {
    return false
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

  return true
}

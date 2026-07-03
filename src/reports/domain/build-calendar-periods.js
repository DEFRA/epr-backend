import { derivePeriodStatus } from './derive-period-status.js'
import { PERIOD_STATUS } from './period-status.js'
import { REPORT_STATUS } from './report-status.js'

/**
 * @import { MergedPeriod } from './merge-reporting-periods.js'
 * @import { PeriodStatus } from './period-status.js'
 * @import { ReportSummary } from '../repository/port.js'
 */

/**
 * @typedef {Omit<MergedPeriod, 'previousSubmissions'> & { periodStatus: PeriodStatus | null }} CalendarPeriod
 */

/**
 * A submitted report is "flagged" once a later summary log restates its closed
 * period, marking it as requiring resubmission.
 * @param {ReportSummary | null | undefined} report
 * @returns {boolean}
 */
const isFlaggedSubmitted = (report) =>
  report?.status === REPORT_STATUS.SUBMITTED &&
  Boolean(report?.resubmissionRequired)

/**
 * Expands merged reporting periods into the submission-grained calendar items.
 *
 * An unflagged period yields one item carrying its derived periodStatus. A
 * period whose latest submitted report was restated by a later summary log
 * always yields two items: the original submitted report (kept visible in the
 * Submitted table) and a "requires resubmission" slot at the next submission
 * number. The resubmission slot carries the in-flight resubmission draft when
 * one exists, else null (the pre-draft skeleton), so the frontend can pick the
 * call to action while the period stays flagged as requiring resubmission.
 *
 * @param {MergedPeriod[]} mergedPeriods
 * @returns {CalendarPeriod[]}
 */
export const buildCalendarPeriods = (mergedPeriods) =>
  mergedPeriods.flatMap(({ previousSubmissions = [], ...period }) => {
    const flaggedSubmitted = [period.report, ...previousSubmissions].find(
      isFlaggedSubmitted
    )

    if (!flaggedSubmitted) {
      return [{ ...period, periodStatus: derivePeriodStatus(period) }]
    }

    // The flagged report is `current` only before the operator starts a
    // resubmission; once a later draft exists it becomes `current` and the
    // flagged report drops to previousSubmissions.
    const draft = isFlaggedSubmitted(period.report) ? null : period.report

    return [
      {
        ...period,
        submissionNumber: flaggedSubmitted.submissionNumber,
        periodStatus: PERIOD_STATUS.SUBMITTED,
        report: flaggedSubmitted
      },
      {
        ...period,
        submissionNumber: flaggedSubmitted.submissionNumber + 1,
        periodStatus: PERIOD_STATUS.REQUIRES_RESUBMISSION,
        report: draft
      }
    ]
  })

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
 * @param {ReportSummary | null | undefined} report
 * @returns {report is ReportSummary}
 */
const isSubmitted = (report) => report?.status === REPORT_STATUS.SUBMITTED

/**
 * Selects the highest-submissionNumber submitted report for the period, i.e.
 * the one whose resubmission flag is currently live. Superseded submissions may
 * still carry a stale `resubmissionRequired` marker from an earlier cycle; those
 * are historical and deliberately ignored.
 * @param {ReportSummary | null | undefined} current
 * @param {ReportSummary[]} previousSubmissions
 * @returns {ReportSummary | undefined}
 */
const latestSubmitted = (current, previousSubmissions) =>
  [current, ...previousSubmissions]
    .filter(isSubmitted)
    .sort((a, b) => b.submissionNumber - a.submissionNumber)[0]

/**
 * Expands merged reporting periods into the submission-grained calendar items.
 *
 * A period is treated as requiring resubmission when its latest submitted
 * report is flagged (a later summary log restated the closed period) and that
 * resubmission has not itself been submitted yet. Such a period yields two
 * items: the flagged submitted report (kept visible in the Submitted table) and
 * a "requires resubmission" slot at the next submission number, carrying the
 * in-flight draft when one exists (else null, the pre-draft skeleton) so the
 * frontend can pick the call to action. Every other period yields one item
 * carrying its derived periodStatus; once the resubmission is itself submitted
 * the latest submitted report is unflagged, so the period collapses back to a
 * single submitted item and the superseded flag is never consulted.
 *
 * @param {MergedPeriod[]} mergedPeriods
 * @returns {CalendarPeriod[]}
 */
export const buildCalendarPeriods = (mergedPeriods) =>
  // previousSubmissions is a feed-only projection, not part of a calendar item,
  // so it is dropped here rather than spread through.
  mergedPeriods.flatMap(({ previousSubmissions = [], ...period }) => {
    const flaggedSubmitted = latestSubmitted(period.report, previousSubmissions)

    if (!flaggedSubmitted?.resubmissionRequired) {
      return [{ ...period, periodStatus: derivePeriodStatus(period) }]
    }

    // `current` is the highest-submissionNumber report for the period. When it
    // is the flagged submitted report itself there is no resubmission draft yet
    // (the pre-draft skeleton); once the operator starts one, `current` is that
    // later draft and the flagged report drops to previousSubmissions.
    const draft =
      period.report &&
      period.report.submissionNumber > flaggedSubmitted.submissionNumber
        ? period.report
        : null

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

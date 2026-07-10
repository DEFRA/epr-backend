import { buildCalendarPeriods } from './build-calendar-periods.js'
import { PERIOD_STATUS } from './period-status.js'
import { REPORT_STATUS } from './report-status.js'

/**
 * @import { MergedPeriod } from './merge-reporting-periods.js'
 * @import { CalendarPeriod } from './build-calendar-periods.js'
 */

/**
 * Expands merged reporting periods into one calendar item per submission, for
 * the opt-in all-submissions view. Superseded submissions are collapsed out of
 * the default calendar (ADR-0038); this view surfaces them for the full history,
 * the same history already available on the report-detail view.
 *
 * Reuses buildCalendarPeriods for each period's current-state items (the current
 * report, plus a requires_resubmission skeleton when a resubmission is pending),
 * then adds the period's previous submissions those items do not already
 * surface. Deduping is keyed on the surfaced reports' ids, not submission
 * numbers, so the synthetic skeleton slot (which carries no real report) can
 * never mask a genuine submission.
 *
 * Only submitted previous submissions are emitted, each carrying periodStatus
 * 'submitted'. Submission numbers are allocated when a draft is created, but a
 * submission number N > 1 can only be created once submission N-1 has been
 * submitted and flagged for resubmission (assertResubmissionAllowed in
 * report-service.js). So a report only drops below the current slot after it has
 * been submitted: every previous submission is a completed one, and the in-flight
 * resubmission draft is always the current slot (surfaced as the
 * requires_resubmission skeleton), never a previous submission. Filtering on
 * submitted status enforces that invariant defensively rather than trusting it,
 * so a non-submitted report can never surface mislabelled as 'submitted'.
 *
 * Items within a period are ordered by submissionNumber ascending, including the
 * synthetic skeleton slot.
 *
 * @param {MergedPeriod[]} mergedPeriods
 * @returns {CalendarPeriod[]}
 */
export const buildAllSubmissionPeriods = (mergedPeriods) =>
  mergedPeriods.flatMap((mergedPeriod) => {
    // previousSubmissions is a feed-only projection, not part of a calendar
    // item, so it is dropped rather than spread through.
    const { previousSubmissions = [], ...period } = mergedPeriod
    const currentStateItems = buildCalendarPeriods([mergedPeriod])
    const surfacedReportIds = new Set(
      currentStateItems.flatMap((item) => (item.report ? [item.report.id] : []))
    )

    const historicalItems = previousSubmissions
      .filter(
        (submission) =>
          submission.status === REPORT_STATUS.SUBMITTED &&
          !surfacedReportIds.has(submission.id)
      )
      .map((submission) => ({
        ...period,
        submissionNumber: submission.submissionNumber,
        periodStatus: PERIOD_STATUS.SUBMITTED,
        report: submission
      }))

    return [...currentStateItems, ...historicalItems].sort(
      (a, b) => a.submissionNumber - b.submissionNumber
    )
  })

import { buildCalendarPeriods } from './build-calendar-periods.js'

/**
 * @import { MergedPeriod } from './merge-reporting-periods.js'
 * @import { CalendarPeriod } from './build-calendar-periods.js'
 */

/**
 * Expands merged reporting periods into one calendar item per submission, for
 * the admin history view. Superseded submissions are deliberately hidden from
 * the shared calendar (ADR-0038); the regulator's overview needs the full audit
 * trail instead.
 *
 * Reuses buildCalendarPeriods for each period's current-state items (the current
 * report plus, when a resubmission is pending, the requires_resubmission
 * skeleton) then adds any previous submissions not already surfaced, deduped on
 * submissionNumber so the flagged submitted report the skeleton derives from is
 * not emitted twice. Each historical item takes its own report status as its
 * periodStatus (in practice always 'submitted', since only submitted reports are
 * ever superseded); no new status value is introduced. Items within a period are
 * ordered by submissionNumber ascending.
 *
 * @param {MergedPeriod[]} mergedPeriods
 * @returns {CalendarPeriod[]}
 */
export const buildAllSubmissionPeriods = (mergedPeriods) =>
  mergedPeriods.flatMap((mergedPeriod) => {
    const { previousSubmissions = [], ...period } = mergedPeriod
    const currentStateItems = buildCalendarPeriods([mergedPeriod])
    const surfaced = new Set(
      currentStateItems.map((item) => item.submissionNumber)
    )

    const historicalItems = previousSubmissions
      .filter((submission) => !surfaced.has(submission.submissionNumber))
      .map((submission) => ({
        ...period,
        submissionNumber: submission.submissionNumber,
        // Derived from the report rather than blanket-stamped 'submitted' so
        // periodStatus and report.status can never disagree, even if a
        // non-submitted report ever ends up below the current submission.
        periodStatus: submission.status,
        report: submission
      }))

    return [...currentStateItems, ...historicalItems].sort(
      (a, b) => a.submissionNumber - b.submissionNumber
    )
  })

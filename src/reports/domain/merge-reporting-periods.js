/**
 * @import { PeriodicReport, ReportSummary } from '../repository/port.js'
 */

/**
 * A report has been submitted when it carries a submission instant. `submittedAt`
 * is an ISO timestamp or null, so truthiness distinguishes the two.
 * @param {ReportSummary | null | undefined} report
 * @returns {report is ReportSummary}
 */
const hasBeenSubmitted = (report) => Boolean(report?.submittedAt)

/**
 * Selects every report holding a submission for the period: those that have
 * been submitted at least once, identified by a retained `submittedAt`, ordered
 * by submissionNumber ascending. The feed emits one row per entry, so a
 * resubmitted period fans out into a row per submission (earliest to latest).
 *
 * Using `submittedAt` rather than the current status means a report that was
 * submitted and later unsubmitted (status back to ready_to_submit, submitted
 * instant retained) is still included, so the feed keeps showing its figures
 * rather than blanking. An in-flight resubmission draft (never submitted, no
 * `submittedAt`) is excluded, so it adds no row and never masks a submission.
 * Ordering is by submissionNumber, not input order, so it does not depend on
 * how the slot's reports happen to be arranged.
 *
 * Deliberately distinct from build-calendar-periods' `latestSubmitted`, which
 * selects by current `status === submitted` for resubmission flagging: an
 * unsubmitted report is not currently submitted there, but is retained here.
 *
 * @param {{ current: ReportSummary | null, previousSubmissions: ReportSummary[] }} slot
 * @returns {ReportSummary[]}
 */
function selectSubmittedReports(slot) {
  return [slot.current, ...slot.previousSubmissions]
    .filter(hasBeenSubmitted)
    .sort((a, b) => a.submissionNumber - b.submissionNumber)
}

/**
 * Indexes persisted periodic-report slots by "year:period" key for a given cadence.
 * @param {PeriodicReport[]} periodicReports
 * @param {string} cadence
 * @returns {Map<string, object>}
 */
function indexPersistedSlots(periodicReports, cadence) {
  const slots = new Map()

  for (const pr of periodicReports) {
    const cadenceSlots = pr.reports?.[cadence]
    if (!cadenceSlots) {
      continue
    }

    for (const [periodKey, slot] of Object.entries(cadenceSlots)) {
      slots.set(`${pr.year}:${periodKey}`, {
        ...slot,
        year: pr.year,
        period: Number(periodKey)
      })
    }
  }

  return slots
}

/**
 * @typedef {{
 *   year: number;
 *   period: number;
 *   startDate: string;
 *   endDate: string;
 *   dueDate: string;
 *   submissionNumber: number;
 *   report: ReportSummary | null;
 *   previousSubmissions?: ReportSummary[];
 *   submittedReports: ReportSummary[];
 * }} MergedPeriod
 *
 * `report` is the current report and MAY be an unsubmitted in-flight draft. Do
 * not use it for public-facing or regulator output. `submittedReports` holds
 * every submitted report for the period, ascending by submissionNumber, so the
 * report-submissions feed can emit one row per submission; read it rather than
 * `report` for anything a resubmission draft must not blank.
 */

/**
 * Merges computed reporting periods with persisted periodic-report slots.
 *
 * For each period:
 * - `report` is the current report (highest submissionNumber), or null
 * - `submittedReports` are all submitted reports (ascending), so an in-flight
 *   resubmission draft in `report` never masks the submitted figures
 * - Periods with active drafts that aren't in the computed set are appended
 *
 * @param {Array<{year: number, period: number, startDate: string, endDate: string, dueDate: string}>} computedPeriods
 * @param {PeriodicReport[]} periodicReports
 * @param {string} cadence
 * @returns {MergedPeriod[]}
 */
export function mergeReportingPeriods(
  computedPeriods,
  periodicReports,
  cadence
) {
  const persistedSlots = indexPersistedSlots(periodicReports, cadence)
  const merged = new Map()

  for (const cp of computedPeriods) {
    const key = `${cp.year}:${cp.period}`
    const slot = persistedSlots.get(key)
    const submittedReports = slot ? selectSubmittedReports(slot) : []

    merged.set(key, {
      year: cp.year,
      period: cp.period,
      startDate: cp.startDate,
      endDate: cp.endDate,
      dueDate: cp.dueDate,
      submissionNumber: slot?.current?.submissionNumber ?? 1,
      report: slot?.current ?? null,
      previousSubmissions: slot?.previousSubmissions ?? [],
      submittedReports
    })
  }

  for (const [key, slot] of persistedSlots) {
    if (merged.has(key) || !slot.current) {
      continue
    }

    const submittedReports = selectSubmittedReports(slot)
    merged.set(key, {
      year: slot.year,
      period: slot.period,
      startDate: slot.startDate,
      endDate: slot.endDate,
      dueDate: slot.dueDate,
      submissionNumber: slot.current.submissionNumber,
      report: slot.current,
      previousSubmissions: slot.previousSubmissions,
      submittedReports
    })
  }

  return Array.from(merged.values()).sort(
    (a, b) => a.year - b.year || a.period - b.period
  )
}

/**
 * @import { PeriodicReport, ReportSummary } from '../repository/port.js'
 */

import { REPORT_STATUS } from './report-status.js'

/**
 * Selects the latest submitted report for a period slot.
 *
 * The slot's reports are ordered by submissionNumber descending (current is the
 * highest), so the first submitted report found is the most recent one. An
 * in-flight resubmission draft sits in `current` and is skipped, so it never
 * masks the last submitted report.
 *
 * @param {{ current: ReportSummary | null, previousSubmissions: ReportSummary[] }} slot
 * @returns {ReportSummary | null}
 */
function selectLatestSubmittedReport(slot) {
  return (
    [slot.current, ...slot.previousSubmissions].find(
      (report) => report?.status === REPORT_STATUS.SUBMITTED
    ) ?? null
  )
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
 *   submittedReport: ReportSummary | null;
 * }} MergedPeriod
 */

/**
 * Merges computed reporting periods with persisted periodic-report slots.
 *
 * For each period:
 * - `report` is the current report (highest submissionNumber), or null
 * - `submittedReport` is the latest submitted report, so an in-flight
 *   resubmission draft in `report` never masks the last submitted figures
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

    merged.set(key, {
      year: cp.year,
      period: cp.period,
      startDate: cp.startDate,
      endDate: cp.endDate,
      dueDate: cp.dueDate,
      submissionNumber: slot?.current?.submissionNumber ?? 1,
      report: slot?.current ?? null,
      submittedReport: slot ? selectLatestSubmittedReport(slot) : null
    })
  }

  for (const [key, slot] of persistedSlots) {
    if (merged.has(key) || !slot.current) {
      continue
    }

    merged.set(key, {
      year: slot.year,
      period: slot.period,
      startDate: slot.startDate,
      endDate: slot.endDate,
      dueDate: slot.dueDate,
      submissionNumber: slot.current.submissionNumber,
      report: slot.current,
      submittedReport: selectLatestSubmittedReport(slot)
    })
  }

  return Array.from(merged.values()).sort(
    (a, b) => a.year - b.year || a.period - b.period
  )
}

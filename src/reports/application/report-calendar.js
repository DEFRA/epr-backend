import { HELD_ACCREDITATION_STATUSES } from '#organisation-read-model/domain/model.js'
import { registrationStatusWindows } from '#organisation-read-model/domain/registration-status-windows.js'
import { buildAllSubmissionPeriods } from '#reports/domain/build-all-submission-periods.js'
import { buildCalendarPeriods } from '#reports/domain/build-calendar-periods.js'
import { CADENCE } from '#reports/domain/cadence.js'
import {
  generatePeriodsInRange,
  hasEnded
} from '#reports/domain/generate-reporting-periods.js'
import { mergeReportingPeriods } from '#reports/domain/merge-reporting-periods.js'
import { periodBounds } from '#reports/domain/reporting-period.js'
import { config } from '#root/config.js'

/**
 * @import { Registration } from '#organisation-read-model/domain/model.js'
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { CalendarDateRange } from '#organisation-read-model/domain/status-timeline.js'
 * @import { GeneratedPeriod } from '#reports/domain/generate-reporting-periods.js'
 * @import { MergedPeriod } from '#reports/domain/merge-reporting-periods.js'
 * @import { PeriodicReport, ReportListItem, ReportSummary } from '#reports/repository/port.js'
 */

/**
 * Curates the full report summary down to the list-response shape so the
 * calendar endpoints don't leak heavy activity payloads.
 * @param {ReportSummary | null} current
 * @returns {ReportListItem | null}
 */
export const toReportListItem = (current) => {
  if (!current) {
    return null
  }
  const { id, status, submissionNumber, submittedAt, submittedBy } = current
  return { id, status, submissionNumber, submittedAt, submittedBy }
}

/**
 * @param {GeneratedPeriod[]} parts - one period's parts, oldest first
 * @returns {GeneratedPeriod}
 */
const fromFirstToLast = (parts) => {
  const [first] = parts
  const [last] = parts.slice(-1)
  return { ...first, endDate: last.endDate }
}

/**
 * Reports are kept one per period, so a period that more than one window
 * touches becomes one period, from the earliest start to the latest end.
 *
 * @param {GeneratedPeriod[]} periods - oldest first
 * @returns {GeneratedPeriod[]}
 */
const onePerPeriod = (periods) => {
  const partsByPeriod = Map.groupBy(periods, ({ period }) => period)
  return [...partsByPeriod.values()].map(fromFirstToLast)
}

/**
 * The reporting obligations a year has, by status. With mid-year status
 * transition on, each kind covers the days that status applied, so a period can
 * be part of a quarter or month. Otherwise only the current status's kind has
 * them, over the days that status applied, in whole periods, as reports are
 * made today.
 *
 * @param {Registration} registration
 * @param {number} year
 * @returns {{ registeredOnly: CalendarDateRange[], accredited: CalendarDateRange[], wholePeriods: boolean }}
 */
const reportingWindowsFor = (registration, year) => {
  const windows = registrationStatusWindows(registration, year)
  if (config.get('featureFlags.midYearStatusTransition')) {
    return { ...windows, wholePeriods: false }
  }
  return HELD_ACCREDITATION_STATUSES.has(
    registration.accreditations[year]?.status.current
  )
    ? { registeredOnly: [], accredited: windows.accredited, wholePeriods: true }
    : {
        registeredOnly: windows.registeredOnly,
        accredited: [],
        wholePeriods: true
      }
}

/**
 * @param {Cadence} cadence
 * @param {CalendarDateRange[]} reportingWindows
 * @param {PeriodicReport[]} storedReports
 * @param {{ now: Date, wholePeriods: boolean }} options
 * @returns {MergedPeriod[]}
 */
const mergedPeriods = (
  cadence,
  reportingWindows,
  storedReports,
  { now, wholePeriods }
) => {
  const periods = onePerPeriod(
    reportingWindows.flatMap(({ from, to }) =>
      generatePeriodsInRange(cadence, from, to)
    )
  )
    .map((period) =>
      wholePeriods
        ? { ...period, ...periodBounds(cadence, period.year, period.period) }
        : period
    )
    .filter((period) => hasEnded(period, now))
  const listed = new Set(periods.map(({ period }) => period))
  return mergeReportingPeriods(periods, storedReports, cadence).filter(
    ({ period }) => listed.has(period)
  )
}

/**
 * A registration's ended reporting periods in a year, merged with its stored
 * reports, registered-only (quarterly) and accredited (monthly) separately. A
 * stored report outside its kind's periods is not listed, as the report routes
 * do not serve it.
 *
 * @param {{
 *   registration: Registration,
 *   storedReports: PeriodicReport[],
 *   year: number,
 *   now?: Date
 * }} params
 * @returns {{
 *   registeredOnly: MergedPeriod[],
 *   accredited: MergedPeriod[],
 *   accreditationNumber?: string
 * }}
 */
export const reportingPeriodsByKind = ({
  registration,
  storedReports,
  year,
  now = new Date()
}) => {
  const { wholePeriods, ...windows } = reportingWindowsFor(registration, year)
  const reportsInYear = storedReports.filter((report) => report.year === year)
  const accreditation = registration.accreditations[year]
  const options = { now, wholePeriods }

  return {
    registeredOnly: mergedPeriods(
      CADENCE.quarterly,
      windows.registeredOnly,
      reportsInYear,
      options
    ),
    accredited: mergedPeriods(
      CADENCE.monthly,
      windows.accredited,
      reportsInYear,
      options
    ),
    accreditationNumber: accreditation?.accreditationNumber
  }
}

/**
 * A registration's reporting obligations in a year, registered-only (quarterly)
 * and accredited (monthly) separately. A kind appears when it has a period to
 * list, and accredited only for an accreditation the read model holds.
 *
 * @param {{
 *   registration: Registration,
 *   storedReports: PeriodicReport[],
 *   year: number,
 *   allSubmissions?: boolean,
 *   now?: Date
 * }} params
 */
export const yearCalendar = ({
  registration,
  storedReports,
  year,
  allSubmissions = false,
  now = new Date()
}) => {
  const byKind = reportingPeriodsByKind({
    registration,
    storedReports,
    year,
    now
  })
  const buildPeriods = allSubmissions
    ? buildAllSubmissionPeriods
    : buildCalendarPeriods

  /**
   * @param {Cadence} cadence
   * @param {MergedPeriod[]} merged
   */
  const calendarPeriods = (cadence, merged) =>
    buildPeriods(merged, now).map((period) => ({
      ...period,
      cadence,
      report: toReportListItem(period.report)
    }))

  const registeredOnly = calendarPeriods(
    CADENCE.quarterly,
    byKind.registeredOnly
  )
  const accredited = byKind.accreditationNumber
    ? calendarPeriods(CADENCE.monthly, byKind.accredited)
    : []

  return {
    year,
    ...(registeredOnly.length > 0 && {
      registeredOnly: { reportingPeriods: registeredOnly }
    }),
    ...(accredited.length > 0 && {
      accredited: {
        accreditationNumber: byKind.accreditationNumber,
        reportingPeriods: accredited
      }
    })
  }
}

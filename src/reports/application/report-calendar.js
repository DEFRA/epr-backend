import { HELD_ACCREDITATION_STATUSES } from '#organisation-read-model/domain/model.js'
import { registrationStatusWindows } from '#organisation-read-model/domain/registration-status-windows.js'
import { statusRanges } from '#organisation-read-model/domain/status-timeline.js'
import { yearBounds } from '#common/helpers/dates/year.js'
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
 * @import { Year } from '#common/helpers/dates/year.js'
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
 * @param {Year} year
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
 * Whether the accredited report routes serve a month: they need the year's
 * accreditation, and refuse a month ending before the day it was first
 * approved (its validFrom).
 *
 * @param {Registration} registration
 * @param {Year} year
 * @returns {(period: MergedPeriod) => boolean}
 */
const servesAccreditedReport = (registration, year) => {
  const timeline = registration.accreditations[year]?.status.timeline ?? []
  const [first] = statusRanges(timeline, yearBounds(year).end).approved ?? []
  return ({ period }) =>
    first !== undefined &&
    periodBounds(CADENCE.monthly, year, period).endDate.localeCompare(
      first.from
    ) >= 0
}

/**
 * The ended periods the reporting windows require a report for.
 *
 * @param {Cadence} cadence
 * @param {CalendarDateRange[]} reportingWindows
 * @param {{ now: Date, wholePeriods: boolean }} options
 * @returns {GeneratedPeriod[]}
 */
const endedPeriodsIn = (cadence, reportingWindows, { now, wholePeriods }) =>
  onePerPeriod(
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

/**
 * @param {Cadence} cadence
 * @param {CalendarDateRange[]} reportingWindows
 * @param {PeriodicReport[]} storedReports
 * @param {{ now: Date, wholePeriods: boolean, served: (period: MergedPeriod) => boolean }} options
 * @returns {MergedPeriod[]}
 */
const mergedPeriods = (
  cadence,
  reportingWindows,
  storedReports,
  { now, wholePeriods, served }
) => {
  const periods = endedPeriodsIn(cadence, reportingWindows, {
    now,
    wholePeriods
  })
  const listed = new Set(periods.map(({ period }) => period))
  return mergeReportingPeriods(periods, storedReports, cadence).filter(
    (period) => listed.has(period.period) || served(period)
  )
}

/**
 * A registration's ended reporting periods in a year, merged with its stored
 * reports, registered-only (quarterly) and accredited (monthly) separately. A
 * stored report outside its kind's periods is listed unless the report routes
 * refuse it.
 *
 * @param {{
 *   registration: Registration,
 *   storedReports: PeriodicReport[],
 *   year: Year,
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
      { ...options, served: () => true }
    ),
    accredited: mergedPeriods(
      CADENCE.monthly,
      windows.accredited,
      reportsInYear,
      { ...options, served: servesAccreditedReport(registration, year) }
    ),
    accreditationNumber: accreditation?.accreditationNumber
  }
}

/**
 * The ended periods of the cadence's kind the registration owes a report for in
 * the year: those touching a day it held that status. Unlike the calendar, it
 * keeps both kinds' windows with mid-year status transition off, so a
 * registered-only quarter before a mid-year accreditation stays reportable; the
 * flag decides only whether a period ends with its window or as a whole period,
 * as the calendar does.
 *
 * @param {{
 *   registration: Registration,
 *   year: Year,
 *   cadence: Cadence,
 *   now?: Date
 * }} params
 * @returns {GeneratedPeriod[]}
 */
export const requiredReportingPeriods = ({
  registration,
  year,
  cadence,
  now = new Date()
}) => {
  const windows = registrationStatusWindows(registration, year)
  const reportingWindows =
    cadence === CADENCE.monthly ? windows.accredited : windows.registeredOnly
  return endedPeriodsIn(cadence, reportingWindows, {
    now,
    wholePeriods: !config.get('featureFlags.midYearStatusTransition')
  })
}

/**
 * A registration's reporting obligations in a year, registered-only (quarterly)
 * and accredited (monthly) separately. A kind appears when it has a period to
 * list, and accredited only for an accreditation the read model holds.
 *
 * @param {{
 *   registration: Registration,
 *   storedReports: PeriodicReport[],
 *   year: Year,
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

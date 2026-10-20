import { registrationStatusWindows } from '#organisation-read-model/domain/registration-status-windows.js'
import { buildCalendarPeriods } from '#reports/domain/build-calendar-periods.js'
import { CADENCE } from '#reports/domain/cadence.js'
import {
  generatePeriodsInRange,
  hasEnded
} from '#reports/domain/generate-reporting-periods.js'
import { mergeReportingPeriods } from '#reports/domain/merge-reporting-periods.js'

/**
 * @import { Registration } from '#organisation-read-model/domain/model.js'
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { CalendarDateRange } from '#organisation-read-model/domain/status-timeline.js'
 * @import { GeneratedPeriod } from '#reports/domain/generate-reporting-periods.js'
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
 * @param {Cadence} cadence
 * @param {CalendarDateRange[]} reportingWindows
 * @param {PeriodicReport[]} storedReports
 * @param {Date} now
 */
const calendarPeriods = (cadence, reportingWindows, storedReports, now) => {
  const periods = onePerPeriod(
    reportingWindows.flatMap(({ from, to }) =>
      generatePeriodsInRange(cadence, from, to)
    )
  ).filter((period) => hasEnded(period, now))
  const merged = mergeReportingPeriods(periods, storedReports, cadence)
  return buildCalendarPeriods(merged).map((period) => ({
    ...period,
    cadence,
    report: toReportListItem(period.report)
  }))
}

/**
 * The reports a registration owes in a year, registered-only (quarterly) and
 * accredited (monthly) separately. A kind appears when it has a period to list.
 *
 * @param {{
 *   registration: Registration,
 *   storedReports: PeriodicReport[],
 *   year: number,
 *   now?: Date
 * }} params
 */
export const yearCalendar = ({
  registration,
  storedReports,
  year,
  now = new Date()
}) => {
  const windows = registrationStatusWindows(registration, year)
  const reportsInYear = storedReports.filter((report) => report.year === year)

  const registeredOnly = calendarPeriods(
    CADENCE.quarterly,
    windows.registeredOnly,
    reportsInYear,
    now
  )
  const accredited = calendarPeriods(
    CADENCE.monthly,
    windows.accredited,
    reportsInYear,
    now
  )

  return {
    year,
    ...(registeredOnly.length > 0 && {
      registeredOnly: { reportingPeriods: registeredOnly }
    }),
    ...(accredited.length > 0 && {
      accredited: {
        ...(registration.accreditations[year]?.accreditationNumber && {
          accreditationNumber:
            registration.accreditations[year].accreditationNumber
        }),
        reportingPeriods: accredited
      }
    })
  }
}

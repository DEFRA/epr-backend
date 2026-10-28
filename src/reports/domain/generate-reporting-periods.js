import { formatDateISO } from '#common/helpers/date-formatter.js'
import { dayAfter } from '#common/helpers/dates/calendar-day.js'
import { yearBounds } from '#common/helpers/dates/year.js'
import { periodForDate } from './period-for-date.js'
import { periodBounds } from './reporting-period.js'
import { MONTHS_PER_PERIOD } from './cadence.js'

/**
 * @import { CalendarDate } from '#common/helpers/date-formatter.js'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { Cadence } from './cadence.js'
 */

/**
 * A reporting period as generated for the calendar, before any stored report is
 * merged onto it. First stage of the calendar pipeline: generated ->
 * `MergedPeriod` -> `CalendarPeriod`.
 *
 * Distinct from `ReportingPeriod`, which is the branded start/end pair alone;
 * this adds the derived due date and the empty report slot.
 *
 * @typedef {{
 *   dueDate: CalendarDate;
 *   endDate: CalendarDate;
 *   period: number;
 *   report: null;
 *   startDate: CalendarDate;
 *   year: Year;
 * }} GeneratedPeriod
 */

const DUE_DAY = 20

/**
 * Due date is the 20th of the month following the period end.
 * @param {Cadence} cadence
 * @param {Year} year
 * @param {number} period
 * @returns {CalendarDate}
 */
const dueDateOf = (cadence, year, period) =>
  formatDateISO(year, period * MONTHS_PER_PERIOD[cadence], DUE_DAY)

/**
 * @param {{ endDate: CalendarDate }} period
 * @param {Date} now
 * @returns {boolean}
 */
export const hasEnded = ({ endDate }, now) => new Date(dayAfter(endDate)) <= now

/**
 * Generates the reporting periods touched by `startDate`..`endDate`, with the
 * first and last trimmed to it. Both dates fall in the same year.
 *
 * @param {Cadence} cadence
 * @param {CalendarDate} startDate
 * @param {CalendarDate} endDate
 * @returns {GeneratedPeriod[]}
 */
export function generatePeriodsInRange(cadence, startDate, endDate) {
  const first = periodForDate(startDate, cadence)
  const last = periodForDate(endDate, cadence)
  return Array.from({ length: last.period - first.period + 1 }, (_, i) => {
    const period = first.period + i
    const full = periodBounds(cadence, first.year, period)
    return {
      year: first.year,
      period,
      startDate:
        startDate.localeCompare(full.startDate) > 0
          ? startDate
          : full.startDate,
      endDate: endDate.localeCompare(full.endDate) < 0 ? endDate : full.endDate,
      dueDate: dueDateOf(cadence, first.year, period),
      report: null
    }
  })
}

/**
 * Generates all reporting periods for a given year and cadence.
 *
 * @param {Cadence} cadence
 * @param {Year} year
 * @returns {GeneratedPeriod[]}
 */
export function generateAllPeriodsForYear(cadence, year) {
  const { start, end } = yearBounds(year)
  return generatePeriodsInRange(cadence, start, end)
}

/**
 * Generates reporting periods for a given year and cadence, filtered to periods
 * that have ended.
 *
 * @param {Cadence} cadence
 * @param {Year} year
 * @param {Date} [now] - Current date (defaults to new Date(), injectable for testing)
 * @returns {GeneratedPeriod[]}
 */
export function generateReportingPeriods(cadence, year, now = new Date()) {
  return generateAllPeriodsForYear(cadence, year).filter((period) =>
    hasEnded(period, now)
  )
}

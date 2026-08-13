import { calendarDate, formatDateISO } from '#common/helpers/date-formatter.js'
import { MONTHS_PER_PERIOD } from './cadence.js'

/**
 * @import { CalendarDate } from '#common/helpers/date-formatter.js'
 * @import { Cadence } from './cadence.js'
 */

/**
 * The inclusive calendar bounds of one reporting period. Branded so a pair can
 * only arrive from a constructor below: an arbitrary pair of dates, however
 * well formed, is not a reporting period. That rules out a pair which is bare
 * and correctly ordered but does not match the cadence it is used with.
 *
 * @typedef {{
 *   startDate: CalendarDate,
 *   endDate: CalendarDate
 * } & { readonly __brand: 'ReportingPeriod' }} ReportingPeriod
 */

/**
 * Derives a period's bounds from its identity — the only way to obtain one for
 * a period being reported on, so the two dates cannot disagree with each other
 * or with the cadence.
 *
 * @param {Cadence} cadence
 * @param {number} year
 * @param {number} period - 1-indexed
 * @returns {ReportingPeriod}
 */
export const periodBounds = (cadence, year, period) => {
  const monthsPerPeriod = MONTHS_PER_PERIOD[cadence]

  if (!monthsPerPeriod) {
    throw new TypeError(`Unknown cadence: ${cadence}`)
  }

  const startMonth = (period - 1) * monthsPerPeriod

  return /** @type {ReportingPeriod} */ ({
    startDate: formatDateISO(year, startMonth, 1),
    endDate: formatDateISO(year, startMonth + monthsPerPeriod, 0)
  })
}

/**
 * Rebuilds a period from bounds already persisted on a report, for callers
 * holding the dates but not the identity they were derived from. Deliberately
 * verbose so it greps: each use is a place that identity was lost, and a
 * candidate for passing the period through instead.
 *
 * @param {string} startDate
 * @param {string} endDate
 * @returns {ReportingPeriod}
 */
export const reportingPeriodFromStoredDates = (startDate, endDate) =>
  /** @type {ReportingPeriod} */ ({
    startDate: calendarDate(startDate),
    endDate: calendarDate(endDate)
  })

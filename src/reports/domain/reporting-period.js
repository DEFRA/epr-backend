import { formatDateISO } from '#common/helpers/date-formatter.js'
import { MONTHS_PER_PERIOD } from './cadence.js'

/**
 * @import { Brand } from '#common/helpers/brand.js'
 * @import { CalendarDate } from '#common/helpers/date-formatter.js'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { Cadence } from './cadence.js'
 */

/**
 * The inclusive calendar bounds of one reporting period. Branded so a pair can
 * only arrive from `periodBounds`: an arbitrary pair of dates, however well
 * formed, is not a reporting period. That rules out a pair which is bare and
 * correctly ordered but does not match the cadence it is used with.
 *
 * @typedef {Brand<{
 *   startDate: CalendarDate,
 *   endDate: CalendarDate
 * }, 'ReportingPeriod'>} ReportingPeriod
 */

/**
 * Derives a period's bounds from its identity — the only way to obtain one for
 * a period being reported on, so the two dates cannot disagree with each other
 * or with the cadence.
 *
 * @param {Cadence} cadence
 * @param {Year} year
 * @param {number} period - 1-indexed
 * @returns {ReportingPeriod}
 */
export const periodBounds = (cadence, year, period) => {
  const monthsPerPeriod = MONTHS_PER_PERIOD[cadence]
  const startMonth = (period - 1) * monthsPerPeriod

  return /** @type {ReportingPeriod} */ ({
    startDate: formatDateISO(year, startMonth, 1),
    endDate: formatDateISO(year, startMonth + monthsPerPeriod, 0)
  })
}

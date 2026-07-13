import { MONTHS_PER_PERIOD } from './cadence.js'
import { toCalendarDate } from '#common/helpers/date-formatter.js'

/** Position of the year portion end in an ISO date string (YYYY-MM-DD) */
const YEAR_END = 4
/** Start and end of the month portion in an ISO date string */
const MONTH_START = 5
const MONTH_END = 7

/**
 * @param {string | Date} dateValue
 * @returns {string}
 */
const toIsoDate = (dateValue) =>
  dateValue instanceof Date ? toCalendarDate(dateValue) : String(dateValue)

/**
 * Maps a date to the reporting period it falls in for the given cadence.
 * Monthly periods are 1-12, quarterly periods are 1-4.
 *
 * @param {string | Date} dateValue - ISO date string (YYYY-MM-DD) or Date
 * @param {string} cadence - 'monthly' or 'quarterly'
 * @returns {{ year: number, period: number }}
 */
export const periodForDate = (dateValue, cadence) => {
  const str = toIsoDate(dateValue)
  const year = Number(str.slice(0, YEAR_END))
  const month = Number(str.slice(MONTH_START, MONTH_END))
  const period = Math.ceil(month / MONTHS_PER_PERIOD[cadence])
  return { year, period }
}

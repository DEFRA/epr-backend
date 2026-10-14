import { toCalendarDate } from '#common/helpers/date-formatter.js'
import { isDateInRange } from './aggregation/filter-records-by-date.js'
import { MONTHS_PER_PERIOD } from './cadence.js'
import { periodBounds } from './reporting-period.js'

/** @import {Cadence} from './cadence.js' */

/** Position of the year portion end in an ISO date string (YYYY-MM-DD) */
const YEAR_END = 4
/** Start and end of the month portion in an ISO date string */
const MONTH_START = 5
const MONTH_END = 7

/**
 * Maps a date to the reporting period it falls in for the given cadence.
 * Monthly periods are 1-12, quarterly periods are 1-4.
 *
 * @param {string | Date} dateValue - ISO date string (YYYY-MM-DD) or Date
 * @param {string} cadence - 'monthly' or 'quarterly'
 * @returns {{ year: number, period: number }}
 */
export const periodForDate = (dateValue, cadence) => {
  const str = toCalendarDate(dateValue)
  const year = Number(str.slice(0, YEAR_END))
  const month = Number(str.slice(MONTH_START, MONTH_END))
  const period = Math.ceil(month / MONTHS_PER_PERIOD[cadence])
  return { year, period }
}

// Some date columns are unvalidated, so a stored value can be anything.
// Deferring to the report's own range check keeps the two in step.
/**
 * The period the report counts a date in, or null if it counts it nowhere.
 *
 * @param {unknown} value
 * @param {Cadence} cadence
 * @returns {{ year: number, period: number } | null}
 */
export const reportedPeriodForDate = (value, cadence) => {
  if (typeof value !== 'string') {
    return null
  }
  const { year, period } = periodForDate(value, cadence)
  if (Number.isNaN(year) || Number.isNaN(period)) {
    return null
  }
  return isDateInRange(value, periodBounds(cadence, year, period))
    ? { year, period }
    : null
}

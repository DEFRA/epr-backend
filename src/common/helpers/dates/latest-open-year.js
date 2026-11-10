import { config } from '#root/config.js'
import { currentUtcYear, nextYear, yearBounds } from './year.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from './year.js' */

/**
 * The latest year the service serves: the current UTC year, or the year after
 * it where the environment opens it early.
 * @param {Date} date
 * @returns {Year}
 */
export function latestOpenYear(date) {
  const current = currentUtcYear(date)
  return config.get('openNextYear') ? nextYear(current) : current
}

/**
 * The last day of the latest open year.
 * @param {Date} date
 * @returns {CalendarDate}
 */
export function lastOpenDay(date) {
  return yearBounds(latestOpenYear(date)).end
}

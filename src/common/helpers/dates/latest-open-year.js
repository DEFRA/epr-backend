import { config } from '#root/config.js'
import { currentUtcYear, lastDayOfYear, nextYear } from './year.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from './year.js' */

/**
 * The latest year the service serves: the current UTC year, or the year after
 * it where the environment opens it early.
 * @param {Date} [now]
 * @returns {Year}
 */
export function latestOpenYear(now = new Date()) {
  const current = currentUtcYear(now)
  return config.get('openNextYear') ? nextYear(current) : current
}

/**
 * The last day of the latest open year.
 * @param {Date} [now]
 * @returns {CalendarDate}
 */
export function lastOpenDay(now = new Date()) {
  return lastDayOfYear(latestOpenYear(now))
}

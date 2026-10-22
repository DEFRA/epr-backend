import { utcCalendarDate } from '#common/helpers/date-formatter.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */

/**
 * @param {CalendarDate} date
 * @param {number} days
 * @returns {CalendarDate}
 */
const shift = (date, days) => {
  const day = new Date(date)
  day.setUTCDate(day.getUTCDate() + days)
  return utcCalendarDate(day)
}

/** @param {CalendarDate} date */
export const dayBefore = (date) => shift(date, -1)

/** @param {CalendarDate} date */
export const dayAfter = (date) => shift(date, 1)

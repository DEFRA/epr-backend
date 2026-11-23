import { calendarDate } from '#common/helpers/date-formatter.js'
import { formatLocalDateTime } from './local-datetime.js'
import { UK_TIME_ZONE } from './uk-time-zone.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */

/**
 * The calendar date an instant falls on in the UK.
 * @param {Date} date
 * @returns {CalendarDate}
 */
export const ukCalendarDate = (date) =>
  calendarDate(formatLocalDateTime(date, UK_TIME_ZONE))

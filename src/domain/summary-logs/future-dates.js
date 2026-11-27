import { ukCalendarDate } from '#common/helpers/date-formatter.js'
import { dayAfter } from '#common/helpers/dates/calendar-day.js'
import { utcYearOf } from '#common/helpers/dates/year.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'

/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */

/** @typedef {{ createdAt: Date }} UploadedSummaryLog */

/**
 * @param {CalendarDate} date
 * @param {UploadedSummaryLog} summaryLog
 * @returns {boolean}
 */
export const isFutureDate = (date, summaryLog) =>
  date.localeCompare(ukCalendarDate(summaryLog.createdAt)) > 0

/**
 * The overseas site can be ahead of the UK, so a load can arrive there the day
 * after upload by UK time, but not in the next year.
 * @param {CalendarDate} date
 * @param {UploadedSummaryLog} summaryLog
 * @returns {boolean}
 */
export const isFutureOverseasReceipt = (date, summaryLog) => {
  const uploadDay = ukCalendarDate(summaryLog.createdAt)
  return (
    date.localeCompare(dayAfter(uploadDay)) > 0 ||
    utcYearOf(date) > utcYearOf(uploadDay)
  )
}

/**
 * @param {CalendarDate} month - the first of the month
 * @param {UploadedSummaryLog} summaryLog
 * @returns {boolean}
 */
export const isFutureMonth = (month, summaryLog) =>
  toYearMonth(month).localeCompare(
    toYearMonth(ukCalendarDate(summaryLog.createdAt))
  ) > 0

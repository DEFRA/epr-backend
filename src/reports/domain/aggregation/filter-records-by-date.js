import { calendarDate } from '#common/helpers/date-formatter.js'
import { YEAR_MONTH_LENGTH } from '#common/helpers/dates/year-month.js'

/**
 * @import { ReportingPeriod } from '../reporting-period.js'
 * @import { ReportableWasteRecordState } from './aggregate-report-detail.js'
 */

/**
 * Returns true when value is a string containing a valid ISO date that falls
 * within the period (both bounds inclusive, compared lexicographically).
 *
 * @param {unknown} value
 * @param {ReportingPeriod} period
 * @returns {boolean}
 */
export function isDateInRange(value, { startDate, endDate }) {
  if (typeof value !== 'string') {
    return false
  }

  const date = calendarDate(value)
  if (Number.isNaN(new Date(date).getTime())) {
    return false
  }

  const normalised =
    date.length === YEAR_MONTH_LENGTH ? calendarDate(`${date}-01`) : date
  return (
    normalised.localeCompare(startDate) >= 0 &&
    normalised.localeCompare(endDate) <= 0
  )
}

/**
 * @param {ReportableWasteRecordState[]} wasteRecords
 * @param {string | undefined} dateField
 * @param {ReportingPeriod} period
 * @returns {ReportableWasteRecordState[]}
 */
export function filterRecordsByDateField(wasteRecords, dateField, period) {
  if (!dateField) {
    return []
  }

  return wasteRecords.filter((wasteRecord) =>
    isDateInRange(wasteRecord.data[dateField], period)
  )
}

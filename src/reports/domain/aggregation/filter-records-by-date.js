import { YEAR_MONTH_LENGTH } from '#common/helpers/dates/year-month.js'

/**
 * Returns true when value is a string containing a valid ISO date that falls
 * within [startDate, endDate] (both inclusive, compared lexicographically).
 *
 * @param {unknown} value
 * @param {string} startDate - ISO date string (YYYY-MM-DD)
 * @param {string} endDate   - ISO date string (YYYY-MM-DD)
 * @returns {boolean}
 */
export function isDateInRange(value, startDate, endDate) {
  if (typeof value !== 'string') {
    return false
  }

  const date = value.slice(0, 10)
  if (Number.isNaN(new Date(date).getTime())) {
    return false
  }

  const normalised = date.length === YEAR_MONTH_LENGTH ? `${date}-01` : date
  return (
    normalised.localeCompare(startDate) >= 0 &&
    normalised.localeCompare(endDate) <= 0
  )
}

/**
 * @param {import('./aggregate-report-detail.js').ReportableWasteRecordState[]} wasteRecords
 * @param {string | undefined} dateField
 * @param {string} startDate
 * @param {string} endDate
 * @returns {import('./aggregate-report-detail.js').ReportableWasteRecordState[]}
 */
export function filterRecordsByDateField(
  wasteRecords,
  dateField,
  startDate,
  endDate
) {
  if (!dateField) {
    return []
  }

  return wasteRecords.filter((wasteRecord) =>
    isDateInRange(wasteRecord.data[dateField], startDate, endDate)
  )
}

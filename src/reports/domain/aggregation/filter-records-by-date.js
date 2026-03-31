const ISO_DATE_RE = /^\d{4}-\d{2}(-\d{2})?/

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
  if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) {
    return false
  }

  const date = value.slice(0, 10)
  return date.localeCompare(startDate) >= 0 && date.localeCompare(endDate) <= 0
}

/**
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteRecords
 * @param {string | undefined} dateField
 * @param {string} startDate
 * @param {string} endDate
 * @returns {import('#domain/waste-records/model.js').WasteRecord[]}
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

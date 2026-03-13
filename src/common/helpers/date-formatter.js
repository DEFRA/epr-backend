/**
 * Date formatting utilities using Intl.DateTimeFormat
 */

/**
 * Cached British date formatter (DD/MM/YYYY)
 * @type {Intl.DateTimeFormat}
 */
const britishFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC'
})

/**
 * Cached British date-time formatter for parts (DD.MM.YY HH:mm)
 * @type {Intl.DateTimeFormat}
 */
const britishDateTimeDotsFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
})

/**
 * Formats a Date object or date string to British format (DD/MM/YYYY)
 * @param {Date|string} date - Date object or ISO date string (YYYY-MM-DD) to format
 * @returns {string} - Formatted date string (e.g., '22/01/2026')
 */
export function formatDate(date) {
  if (!date) {
    return ''
  }
  const dateObj =
    typeof date === 'string' ? new Date(date + 'T00:00:00.000Z') : date
  return britishFormatter.format(dateObj)
}

/**
 * Formats a Date object to British date-time format with dots (DD.MM.YY HH:mm)
 * @param {Date} date - Date object to format
 * @returns {string} - Formatted date-time string (e.g., '04.02.26 14:49')
 */
export function formatDateTimeDots(date) {
  const parts = britishDateTimeDotsFormatter.formatToParts(date)
  const partMap = Object.fromEntries(parts.map((p) => [p.type, p.value]))
  return `${partMap.day}.${partMap.month}.${partMap.year} ${partMap.hour}:${partMap.minute}`
}

/**
 * Formats year, month, and day components as an ISO date string (YYYY-MM-DD).
 * @param {number} year
 * @param {number} month - 0-indexed month
 * @param {number} day - day of month (0 = last day of previous month)
 * @returns {string}
 */
export function formatDateISO(year, month, day) {
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
}

/**
 * Converts a Date or ISO string to ISO string, or returns empty string if null/undefined
 * @param {Date|string|null|undefined} date
 * @returns {string}
 */
export function toISOString(date) {
  if (!date) {
    return ''
  }
  return date instanceof Date ? date.toISOString() : date
}

const REFERENCE_YEAR = 2026
const MONTHS_IN_YEAR = 12
/**
 * Generates an array of short month names using British English locale.
 * @returns {string[]} Array of 12 month abbreviations (e.g., ['Jan', 'Feb', ..., 'Sept', ..., 'Dec'])
 */
export const getMonthNames = () =>
  Array.from({ length: MONTHS_IN_YEAR }, (_, i) =>
    new Date(Date.UTC(REFERENCE_YEAR, i, 1)).toLocaleString('en-GB', {
      month: 'short',
      timeZone: 'UTC'
    })
  )

/**
 * Generates an array of month objects from a start year to the current month.
 *
 * @param {number} [startYear=2026] - The year to start generating months from (January of that year)
 * @returns {Array<{monthNumber: number, month: string, year: number}>} Array of month objects, each containing:
 *   - monthNumber: The month number (1-12)
 *   - month: Short month name  (e.g., 'Jan', 'Feb', 'Sept')
 *   - year: The four-digit year
 */
export const getMonthRange = (startYear = REFERENCE_YEAR) => {
  const now = new Date()

  const totalMonths =
    (now.getUTCFullYear() - startYear) * MONTHS_IN_YEAR + now.getUTCMonth() + 1

  return Array.from({ length: totalMonths }, (_, i) => {
    const d = new Date(Date.UTC(startYear, i, 1))
    return {
      monthNumber: d.getUTCMonth() + 1,
      month: d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }),
      year: d.getUTCFullYear()
    }
  })
}

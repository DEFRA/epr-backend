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
 * @param {Date|string|null|undefined} date - Date object or ISO date string (YYYY-MM-DD) to format
 * @returns {string} - Formatted date string (e.g., '22/01/2026'), or '' when date is null/undefined
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
 * The YYYY-MM-DD calendar date for a Date, in UTC.
 * @param {Date} date
 * @returns {string} YYYY-MM-DD
 */
export const toCalendarDate = (date) => date.toISOString().slice(0, 10)

/**
 * Formats year, month, and day components as an ISO date string (YYYY-MM-DD).
 * @param {number} year
 * @param {number} month - 0-indexed month
 * @param {number} day - day of month (0 = last day of previous month)
 * @returns {string}
 */
export const formatDateISO = (year, month, day) =>
  toCalendarDate(new Date(Date.UTC(year, month, day)))

/**
 * Extracts the YYYY-MM-DD calendar date from a date field, tolerant of either
 * a bare date string or a full ISO datetime string — older persisted
 * documents may carry the latter due to historical Joi coercion. Slicing to
 * the first 10 characters means callers never need to know or care which
 * shape a given stored value is in. Nullish input passes through as null so
 * optional-chained callers compose without a pre-slice guard.
 * @param {string | null | undefined} dateString
 * @returns {string | null} YYYY-MM-DD, or null when input is nullish
 */
export const calendarDate = (dateString) => dateString?.slice(0, 10) ?? null

/**
 * Expands a calendar-date string (bare YYYY-MM-DD or a full ISO datetime,
 * either accepted) into the Date representing UTC start-of-day
 * (00:00:00.000) for that calendar date.
 * @param {string} dateString
 * @returns {Date}
 */
export function startOfDay(dateString) {
  return new Date(`${calendarDate(dateString)}T00:00:00.000Z`)
}

/**
 * Expands a calendar-date string (bare YYYY-MM-DD or a full ISO datetime,
 * either accepted) into the Date representing UTC end-of-day (23:59:59.999)
 * for that calendar date.
 * @param {string} dateString
 * @returns {Date}
 */
export function endOfDay(dateString) {
  return new Date(`${calendarDate(dateString)}T23:59:59.999Z`)
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

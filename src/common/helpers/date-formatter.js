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

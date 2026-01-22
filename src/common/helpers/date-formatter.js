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
 * Formats a Date object to British format (DD/MM/YYYY)
 * @param {Date} date - Date object to format
 * @returns {string} - Formatted date string (e.g., '22/01/2026')
 */
export function formatDate(date) {
  return britishFormatter.format(date)
}

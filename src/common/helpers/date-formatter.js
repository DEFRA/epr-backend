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

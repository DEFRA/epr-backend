/**
 * Extracts the year-month portion from an ISO date string.
 * e.g. '2026-03-01' → '2026-03'
 *
 * @param {string} isoDate - An ISO date string (YYYY-MM-DD or longer)
 * @returns {string} Year-month in YYYY-MM format
 */
const YEAR_MONTH_LENGTH = 7

export const toYearMonth = (isoDate) => isoDate.slice(0, YEAR_MONTH_LENGTH)

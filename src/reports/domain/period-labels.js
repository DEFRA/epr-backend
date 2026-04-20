const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
]

/**
 * Formats a reporting period as a human-readable label.
 * @param {string} cadence - 'monthly' or 'quarterly'
 * @param {number} period - 1-based period number
 * @param {number} year
 * @returns {string} e.g. 'Jan 2026', 'Q1 2026'
 */
export function formatPeriodLabel(cadence, period, year) {
  if (cadence === 'monthly') {
    return `${MONTH_ABBREVIATIONS[period - 1]} ${year}`
  }
  return `Q${period} ${year}`
}

/**
 * Map month name to period number.
 * @type {Record<string, number>}
 */
export const MONTHLY_PERIODS = Object.freeze({
  January: 1,
  February: 2,
  March: 3,
  April: 4,
  May: 5,
  June: 6,
  July: 7,
  August: 8,
  September: 9,
  October: 10,
  November: 11,
  December: 12
})

/**
 * Map quarter name to period number.
 * @type {Record<string, number>}
 * @example QUARTERLY_PERIODS.Q1 // 1
 */
export const QUARTERLY_PERIODS = Object.freeze({
  Q1: 1,
  Q2: 2,
  Q3: 3,
  Q4: 4
})

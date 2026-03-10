/**
 * Returns the current reporting period for the given cadence.
 * Placeholder — will be replaced by DB-backed period discovery.
 * @param {import('./cadence.js').MONTHLY | import('./cadence.js').QUARTERLY} cadence
 * @param {Date} [now] - Current date (injectable for testing)
 * @returns {{ year: number, period: number, startDate: string, endDate: string }}
 */
export function getCurrentPeriod(cadence, now = new Date()) {
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed

  const period = Math.floor(month / cadence.monthsPerPeriod) + 1
  const startMonth = (period - 1) * cadence.monthsPerPeriod

  const startDate = formatDate(year, startMonth, 1)
  const endDate = formatDate(year, startMonth + cadence.monthsPerPeriod, 0)

  return { year, period, startDate, endDate }
}

/**
 * Formats a date as YYYY-MM-DD.
 * @param {number} year
 * @param {number} month - 0-indexed month
 * @param {number} day - day of month (0 = last day of previous month)
 * @returns {string}
 */
function formatDate(year, month, day) {
  const d = new Date(year, month, day)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

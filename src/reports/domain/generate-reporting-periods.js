import { formatDateISO } from '#common/helpers/date-formatter.js'
import { MONTHS_PER_PERIOD } from './cadence.js'

const DUE_DAY = 20
const MONTHS_IN_YEAR = 12

/**
 * Computes the due date for a reporting period.
 * Due date is the 20th of the month following the period end.
 * @param {number} year
 * @param {number} endMonth - 0-indexed month of the period end
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
function computeDueDate(year, endMonth) {
  return formatDateISO(year, endMonth + 1, DUE_DAY)
}

/**
 * Generates all reporting periods for a given year and cadence,
 * up to and including the period that contains the current date.
 *
 * Each period includes `dueDate` and `report: null` (placeholder
 * for future persistence layer).
 *
 * @param {string} cadence - Cadence key ('monthly' or 'quarterly')
 * @param {number} year
 * @param {Date} [now] - Current date (defaults to new Date(), injectable for testing)
 * @returns {Array<{year: number, period: number, startDate: string, endDate: string, dueDate: string, report: null}>}
 */
export function generateReportingPeriods(cadence, year, now = new Date()) {
  const monthsPerPeriod = MONTHS_PER_PERIOD[cadence]

  if (!monthsPerPeriod) {
    throw new TypeError(`Unknown cadence: ${cadence}`)
  }

  const periodsPerYear = MONTHS_IN_YEAR / monthsPerPeriod
  const allPeriods = Array.from({ length: periodsPerYear }, (_, i) => {
    const period = i + 1
    const startMonth = i * monthsPerPeriod
    const endMonth = startMonth + monthsPerPeriod - 1
    const startDate = formatDateISO(year, startMonth, 1)
    const endDate = formatDateISO(year, endMonth + 1, 0)
    const dueDate = computeDueDate(year, endMonth)

    return { year, period, startDate, endDate, dueDate, report: null }
  })

  return allPeriods.filter((p) => new Date(p.startDate) <= now)
}

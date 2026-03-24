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
 * Generates all reporting periods for a given year and cadence.
 *
 * @param {string} cadence - Cadence key ('monthly' or 'quarterly')
 * @param {number} year
 * @returns {Array<{year: number, period: number, startDate: string, endDate: string, dueDate: string, report: null}>}
 */
export function generateAllPeriodsForYear(cadence, year) {
  const monthsPerPeriod = MONTHS_PER_PERIOD[cadence]

  if (!monthsPerPeriod) {
    throw new TypeError(`Unknown cadence: ${cadence}`)
  }

  const periodsPerYear = MONTHS_IN_YEAR / monthsPerPeriod
  return Array.from({ length: periodsPerYear }, (_, i) => {
    const period = i + 1
    const startMonth = i * monthsPerPeriod
    const endMonth = startMonth + monthsPerPeriod - 1
    const startDate = formatDateISO(year, startMonth, 1)
    const endDate = formatDateISO(year, endMonth + 1, 0)
    const dueDate = computeDueDate(year, endMonth)

    return { year, period, startDate, endDate, dueDate, report: null }
  })
}

/**
 * Generates reporting periods for a given year and cadence,
 * filtered to only include periods that have ended.
 *
 * @param {string} cadence - Cadence key ('monthly' or 'quarterly')
 * @param {number} year
 * @param {Date} [now] - Current date (defaults to new Date(), injectable for testing)
 * @returns {Array<{year: number, period: number, startDate: string, endDate: string, dueDate: string, report: null}>}
 */
export function generateReportingPeriods(cadence, year, now = new Date()) {
  return generateAllPeriodsForYear(cadence, year).filter((p) => {
    const dayAfterEnd = new Date(p.endDate)
    dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1)
    return dayAfterEnd <= now
  })
}

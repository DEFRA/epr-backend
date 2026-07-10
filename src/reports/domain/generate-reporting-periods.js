import { formatDateISO } from '#common/helpers/date-formatter.js'
import { MONTHS_PER_PERIOD } from './cadence.js'
import { filterPeriodsFromDate } from './filter-periods-from-date.js'

/**
 * @import { Cadence } from './cadence.js'
 */

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
 * @param {Cadence} cadence
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
 * Generates reporting periods for a given year and cadence, filtered to periods
 * that have ended and, when `fromDate` is supplied, bounded to those not ending
 * before it (the accreditation `validFrom` front trim). Bounding lives here so
 * every caller — operator calendar, admin export, compliance — is consistent.
 * A `toDate` bound (registration/accreditation `validTo`) is a future extension.
 *
 * @param {Cadence} cadence
 * @param {number} year
 * @param {Date} [now] - Current date (defaults to new Date(), injectable for testing)
 * @param {string | null} [fromDate] - ISO `YYYY-MM-DD` lower bound; periods ending before it are dropped
 * @returns {Array<{year: number, period: number, startDate: string, endDate: string, dueDate: string, report: null}>}
 */
export function generateReportingPeriods(
  cadence,
  year,
  now = new Date(),
  fromDate
) {
  const ended = generateAllPeriodsForYear(cadence, year).filter((p) => {
    const dayAfterEnd = new Date(p.endDate)
    dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1)
    return dayAfterEnd <= now
  })

  return fromDate ? filterPeriodsFromDate(ended, fromDate) : ended
}

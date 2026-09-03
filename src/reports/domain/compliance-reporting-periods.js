import { CADENCE } from './cadence.js'
import { periodKey } from './period-key.js'
import { generateReportingPeriods } from './generate-reporting-periods.js'

/**
 * @import { CalendarDate } from '#common/helpers/date-formatter.js'
 * @import { GeneratedPeriod } from './generate-reporting-periods.js'
 */

/**
 * @typedef {{
 *   key: string;
 *   cadence: string;
 *   year: number;
 *   period: number;
 *   label: string;
 *   startDate: CalendarDate;
 *   endDate: CalendarDate;
 *   dueDate: CalendarDate;
 * }} CompliancePeriod
 */

const MONTHS_PER_QUARTER = 3

const MONTH_ABBR = [
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
 * @param {string} cadence
 * @param {number} period
 * @returns {string} e.g. 'Jan Report', 'Q1 Report'
 */
function complianceLabel(cadence, period) {
  return cadence === 'monthly'
    ? `${MONTH_ABBR[period - 1]} Report`
    : `Q${period} Report`
}

/**
 * @param {GeneratedPeriod} p - Period from generateReportingPeriods
 * @param {string} cadence
 * @returns {CompliancePeriod}
 */
function annotate(p, cadence) {
  return {
    key: periodKey({ year: p.year, cadence, period: p.period }),
    cadence,
    year: p.year,
    period: p.period,
    label: complianceLabel(cadence, p.period),
    startDate: p.startDate,
    endDate: p.endDate,
    dueDate: p.dueDate
  }
}

/** @param {{ period: number }} p */
function isQuarterEnd(p) {
  return p.period % MONTHS_PER_QUARTER === 0
}

/**
 * @param {number} year
 * @param {Date} now
 * @returns {Map<number, GeneratedPeriod>}
 */
function quarterlyByPeriod(year, now) {
  return new Map(
    generateReportingPeriods(CADENCE.quarterly, year, now).map((q) => [
      q.period,
      q
    ])
  )
}

/**
 * Returns all ended reporting periods (both cadences) for the current calendar year,
 * from January 1 through today, ordered ascending by end date with monthly
 * before quarterly on the same end date.
 *
 * @returns {CompliancePeriod[]}
 */
export function generateComplianceReportingPeriods() {
  const now = new Date()
  const year = now.getUTCFullYear()
  const quarterly = quarterlyByPeriod(year, now)

  const result = []
  for (const p of generateReportingPeriods(CADENCE.monthly, year, now)) {
    result.push(annotate(p, CADENCE.monthly))
    if (isQuarterEnd(p)) {
      const quarter = /** @type {GeneratedPeriod} */ (
        quarterly.get(p.period / MONTHS_PER_QUARTER)
      )
      result.push(annotate(quarter, CADENCE.quarterly))
    }
  }
  return result
}

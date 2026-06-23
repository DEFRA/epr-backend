import { periodForDate } from './period-for-date.js'
import { REPORT_STATUS } from './report-status.js'

/** @import {PeriodicReport} from '#reports/repository/port.js' */

/**
 * @param {number} year
 * @param {number | string} period
 * @returns {string}
 */
const periodKey = (year, period) => `${year}:${period}`

/**
 * Builds the set of reporting periods that have been submitted for the given
 * cadence. A period counts as submitted when its current report has status
 * 'submitted' or it has any previous submissions.
 *
 * Keys are opaque to callers: use {@link isDateInSubmittedPeriod} to test a date
 * against the result.
 *
 * @param {PeriodicReport[]} periodicReports
 * @param {string} cadence - 'monthly' or 'quarterly'
 * @returns {Set<string>}
 */
export const buildSubmittedPeriods = (periodicReports, cadence) => {
  const submitted = new Set()
  for (const periodicReport of periodicReports) {
    const slots = periodicReport.reports[cadence]
    if (!slots) {
      continue
    }
    for (const [period, slot] of Object.entries(slots)) {
      const hasBeenSubmitted =
        slot.current?.status === REPORT_STATUS.SUBMITTED ||
        slot.previousSubmissions?.length > 0
      if (hasBeenSubmitted) {
        submitted.add(periodKey(periodicReport.year, period))
      }
    }
  }
  return submitted
}

/**
 * Tests whether a date falls in one of the submitted periods.
 *
 * @param {Set<string>} submittedPeriods - result of {@link buildSubmittedPeriods}
 * @param {string | Date} dateValue
 * @param {string} cadence - 'monthly' or 'quarterly'
 * @returns {boolean}
 */
export const isDateInSubmittedPeriod = (
  submittedPeriods,
  dateValue,
  cadence
) => {
  const { year, period } = periodForDate(dateValue, cadence)
  return submittedPeriods.has(periodKey(year, period))
}

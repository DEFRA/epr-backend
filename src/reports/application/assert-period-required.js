import { notFound } from '#common/helpers/logging/cdp-boom.js'
import { errorCodes } from '#reports/enums/error-codes.js'
import { hasStoredSubmission } from './submission-lookup.js'

/**
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { GeneratedPeriod } from '#reports/domain/generate-reporting-periods.js'
 * @import { PeriodicReport } from '#reports/repository/port.js'
 */

/**
 * Throws a 404 Boom when the registration owes no report for the period and
 * has none stored for it.
 *
 * @param {PeriodicReport[]} storedReports
 * @param {GeneratedPeriod[]} requiredPeriods
 * @param {Year} year
 * @param {Cadence} cadence
 * @param {number} period
 * @returns {void}
 */
export const assertPeriodRequired = (
  storedReports,
  requiredPeriods,
  year,
  cadence,
  period
) => {
  const required = requiredPeriods.some((owed) => owed.period === period)

  if (!required && !hasStoredSubmission(storedReports, year, cadence, period)) {
    throw notFound(
      `No report is required for ${cadence} period ${period} of ${year}`,
      errorCodes.periodNotRequired,
      {
        event: {
          action: 'check_report_period',
          reason: `cadence=${cadence} period=${period} year=${year}`
        }
      }
    )
  }
}

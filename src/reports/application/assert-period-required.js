import { notFound } from '#common/helpers/logging/cdp-boom.js'
import { errorCodes } from '#reports/enums/error-codes.js'

/**
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { Cadence } from '#reports/domain/cadence.js'
 * @import { GeneratedPeriod } from '#reports/domain/generate-reporting-periods.js'
 */

/**
 * Throws a 404 Boom when the registration owes no report for the period.
 *
 * @param {GeneratedPeriod[]} requiredPeriods
 * @param {Year} year
 * @param {Cadence} cadence
 * @param {number} period
 * @returns {void}
 */
export const assertPeriodRequired = (
  requiredPeriods,
  year,
  cadence,
  period
) => {
  if (!requiredPeriods.some((required) => required.period === period)) {
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

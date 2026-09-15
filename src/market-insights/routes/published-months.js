import Joi from 'joi'
import { badRequest } from '#common/helpers/logging/cdp-boom.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { formatLocalDateTime } from '#common/helpers/dates/local-datetime.js'
import { UK_TIME_ZONE } from '#common/helpers/dates/uk-time-zone.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { generateAllPeriodsForYear } from '#reports/domain/generate-reporting-periods.js'
import { periodRefSchema } from '#reports/domain/period-ref.schema.js'
import { periodBounds } from '#reports/domain/reporting-period.js'
import { errorCodes } from '#reports/enums/error-codes.js'

/**
 * Every market insights route is keyed by a monthly reporting period. Only
 * monthly is accepted, until a quarterly publication exists.
 */
export const monthlyPeriodParamsSchema = periodRefSchema.keys({
  cadence: Joi.string().valid(CADENCE.monthly).required()
})

/**
 * The reporting months from January up to the requested period. A period that
 * has not ended is rejected, which is what keeps the month still running out
 * of the aggregate. Ended is judged on the UK calendar, not UTC, because the
 * page asking for the month just gone reads a UK clock.
 *
 * @param {{ year: number, period: number }} params
 * @param {Date} now
 * @param {string} action - the logging event action of the route asking
 * @returns {import('#common/helpers/dates/year-month.js').YearMonth[]} in order
 */
export const publishedMonthsThrough = ({ year, period }, now, action) => {
  const ukMonthNow = toYearMonth(formatLocalDateTime(now, UK_TIME_ZONE))
  const ended = generateAllPeriodsForYear(CADENCE.monthly, year).filter(
    (p) =>
      p.period <= period && toYearMonth(p.endDate).localeCompare(ukMonthNow) < 0
  )
  if (ended.length < period) {
    throw badRequest(
      `Cannot serve market insights for period ${period} — period has not yet ended`,
      errorCodes.periodNotEnded,
      {
        event: {
          action,
          reason: `period=${period} cadence=${CADENCE.monthly} year=${year}`
        },
        payload: {
          periodNotEnded: {
            period,
            cadence: CADENCE.monthly,
            endDate: periodBounds(CADENCE.monthly, year, period).endDate
          }
        }
      }
    )
  }
  return ended.map((p) => toYearMonth(p.startDate))
}

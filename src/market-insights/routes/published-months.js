import { badRequest } from '#common/helpers/logging/cdp-boom.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { formatLocalDateTime } from '#common/helpers/dates/local-datetime.js'
import { UK_TIME_ZONE } from '#common/helpers/dates/uk-time-zone.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { generateAllPeriodsForYear } from '#reports/domain/generate-reporting-periods.js'
import { periodBounds } from '#reports/domain/reporting-period.js'
import { errorCodes } from '#reports/enums/error-codes.js'

/**
 * The reporting months from January up to the requested period. A period that
 * has not ended is rejected, which is what keeps the month still running out
 * of the aggregate. Ended is judged on the UK calendar, not UTC, because the
 * page asking for the month just gone reads a UK clock.
 *
 * @param {{ name: string, action: string }} table - the publication table asked for, as the rejection names it
 * @param {number} year
 * @param {number} period
 * @param {Date} now
 * @returns {import('#common/helpers/dates/year-month.js').YearMonth[]} in order
 */
export const publishedMonthsThrough = (table, year, period, now) => {
  const ukMonthNow = toYearMonth(formatLocalDateTime(now, UK_TIME_ZONE))
  const ended = generateAllPeriodsForYear(CADENCE.monthly, year).filter(
    (p) =>
      p.period <= period && toYearMonth(p.endDate).localeCompare(ukMonthNow) < 0
  )
  if (ended.length < period) {
    throw badRequest(
      `Cannot serve the ${table.name} for period ${period} — period has not yet ended`,
      errorCodes.periodNotEnded,
      {
        event: {
          action: table.action,
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

import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { badRequest } from '#common/helpers/logging/cdp-boom.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { formatLocalDateTime } from '#common/helpers/dates/local-datetime.js'
import { UK_TIME_ZONE } from '#common/helpers/dates/uk-time-zone.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { generateAllPeriodsForYear } from '#reports/domain/generate-reporting-periods.js'
import { periodRefSchema } from '#reports/domain/period-ref.schema.js'
import { periodBounds } from '#reports/domain/reporting-period.js'
import { errorCodes } from '#reports/enums/error-codes.js'
import { buildWasteBalanceTable } from '#market-insights/application/waste-balance-table.js'
import { wasteBalanceResponseSchema } from './waste-balance-response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const marketInsightsWasteBalancePath =
  '/v1/market-insights/{year}/{cadence}/{period}/waste-balance'

/**
 * The reporting months from January up to the requested period. A period that
 * has not ended is rejected, which is what keeps the month still running out
 * of the aggregate. Ended is judged on the UK calendar, not UTC, because the
 * page asking for the month just gone reads a UK clock.
 *
 * @param {number} year
 * @param {number} period
 * @param {Date} now
 * @returns {import('#common/helpers/dates/year-month.js').YearMonth[]} in order
 */
const publishedMonthsThrough = (year, period, now) => {
  const ukMonthNow = toYearMonth(formatLocalDateTime(now, UK_TIME_ZONE))
  const ended = generateAllPeriodsForYear(CADENCE.monthly, year).filter(
    (p) => p.period <= period && toYearMonth(p.endDate) < ukMonthNow
  )
  if (ended.length < period) {
    throw badRequest(
      `Cannot serve the waste balance for period ${period} — period has not yet ended`,
      errorCodes.periodNotEnded,
      {
        event: {
          action: 'market_insights_waste_balance',
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

export const marketInsightsWasteBalanceGet = {
  method: 'GET',
  path: marketInsightsWasteBalancePath,
  options: {
    auth: {
      scope: [SCOPES.marketDataRead]
    },
    tags: ['api', 'market-insights'],
    validate: {
      params: periodRefSchema.keys({
        cadence: Joi.string().valid(CADENCE.monthly).required()
      })
    },
    response: {
      schema: wasteBalanceResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: { year: number, cadence: 'monthly', period: number },
   *   ledgerRepository: import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository,
   *   summaryLogRowStatesRepository: import('#waste-records/repository/port.js').SummaryLogRowStatesRepository,
   *   organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
   *   overseasSitesRepository: import('#overseas-sites/repository/port.js').OverseasSitesRepository,
   *   reportsRepository: import('#reports/repository/port.js').ReportsRepository
   * }} request
   * @param {HapiResponseToolkit} h
   * @returns {Promise<import('#common/hapi-types.js').HapiResponseObject>}
   */
  handler: async (request, h) => {
    const {
      ledgerRepository,
      summaryLogRowStatesRepository,
      organisationsRepository,
      overseasSitesRepository,
      reportsRepository,
      logger,
      params: { year, period }
    } = request

    const now = new Date()
    const table = await buildWasteBalanceTable({
      ledgerRepository,
      summaryLogRowStatesRepository,
      organisationsRepository,
      overseasSitesRepository,
      reportsRepository,
      logger,
      months: publishedMonthsThrough(year, period, now),
      now
    })

    return h.response(table).code(StatusCodes.OK)
  }
}

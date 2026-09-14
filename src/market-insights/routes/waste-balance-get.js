import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { badRequest } from '#common/helpers/logging/cdp-boom.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { generateReportingPeriods } from '#reports/domain/generate-reporting-periods.js'
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
 * of the aggregate.
 *
 * @param {number} year
 * @param {number} period
 * @param {Date} now
 * @returns {string[]} `YYYY-MM` keys, in order
 */
const publishedMonthsThrough = (year, period, now) => {
  const ended = generateReportingPeriods(CADENCE.monthly, year, now).filter(
    (p) => p.period <= period
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
   *   overseasSitesRepository: import('#overseas-sites/repository/port.js').OverseasSitesRepository
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
      logger,
      params: { year, period }
    } = request

    const now = new Date()
    const table = await buildWasteBalanceTable({
      ledgerRepository,
      summaryLogRowStatesRepository,
      organisationsRepository,
      overseasSitesRepository,
      logger,
      months: publishedMonthsThrough(year, period, now),
      now
    })

    return h.response(table).code(StatusCodes.OK)
  }
}

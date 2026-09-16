import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { buildWasteBalanceTable } from '#market-insights/application/waste-balance-table.js'
import {
  monthlyPeriodParamsSchema,
  publishedMonthsThrough
} from './published-months.js'
import { wasteBalanceResponseSchema } from './waste-balance-response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const marketInsightsWasteBalancePath =
  '/v1/market-insights/{year}/{cadence}/{period}/waste-balance'

export const marketInsightsWasteBalanceGet = {
  method: 'GET',
  path: marketInsightsWasteBalancePath,
  options: {
    auth: {
      scope: [SCOPES.marketDataRead]
    },
    tags: ['api', 'market-insights'],
    validate: {
      params: monthlyPeriodParamsSchema
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
      params
    } = request

    const now = new Date()
    const table = await buildWasteBalanceTable({
      ledgerRepository,
      summaryLogRowStatesRepository,
      organisationsRepository,
      overseasSitesRepository,
      reportsRepository,
      logger,
      year: params.year,
      months: publishedMonthsThrough(
        params,
        now,
        'market_insights_waste_balance'
      ),
      now
    })

    return h.response(table).code(StatusCodes.OK)
  }
}

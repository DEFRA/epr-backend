import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { buildWasteBalanceTable } from '#market-insights/application/waste-balance-table.js'
import {
  monthlyPeriodParamsSchema,
  publishedMonthsThrough
} from './published-months.js'
import { wasteBalanceResponseSchema } from './waste-balance-response.schema.js'

/** @import { HapiRequest, HapiResponseObject, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { OverseasSitesRepository } from '#overseas-sites/repository/port.js' */
/** @import { ReportsRepository } from '#reports/repository/port.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { SummaryLogRowStatesRepository } from '#waste-records/repository/port.js' */

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
   *   params: { year: Year, cadence: 'monthly', period: number },
   *   ledgerRepository: WasteBalanceLedgerRepository,
   *   summaryLogRowStatesRepository: SummaryLogRowStatesRepository,
   *   organisationsRepository: OrganisationsRepository,
   *   overseasSitesRepository: OverseasSitesRepository,
   *   reportsRepository: ReportsRepository
   * }} request
   * @param {HapiResponseToolkit} h
   * @returns {Promise<HapiResponseObject>}
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

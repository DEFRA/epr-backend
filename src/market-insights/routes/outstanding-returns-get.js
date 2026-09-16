import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { buildOutstandingReturnsTable } from '#market-insights/application/outstanding-returns.js'
import {
  monthlyPeriodParamsSchema,
  publishedMonthsThrough
} from './published-months.js'
import { outstandingReturnsResponseSchema } from './outstanding-returns-response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const marketInsightsOutstandingReturnsPath =
  '/v1/market-insights/{year}/{cadence}/{period}/outstanding-returns'

export const marketInsightsOutstandingReturnsGet = {
  method: 'GET',
  path: marketInsightsOutstandingReturnsPath,
  options: {
    auth: {
      scope: [SCOPES.marketDataRead]
    },
    tags: ['api', 'market-insights'],
    validate: {
      params: monthlyPeriodParamsSchema
    },
    response: {
      schema: outstandingReturnsResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: { year: number, cadence: 'monthly', period: number },
   *   organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
   *   reportsRepository: import('#reports/repository/port.js').ReportsRepository
   * }} request
   * @param {HapiResponseToolkit} h
   * @returns {Promise<import('#common/hapi-types.js').HapiResponseObject>}
   */
  handler: async (request, h) => {
    const { organisationsRepository, reportsRepository, params } = request

    const now = new Date()
    const table = await buildOutstandingReturnsTable({
      organisationsRepository,
      reportsRepository,
      year: params.year,
      months: publishedMonthsThrough(
        params,
        now,
        'market_insights_outstanding_returns'
      ),
      now
    })

    return h.response(table).code(StatusCodes.OK)
  }
}

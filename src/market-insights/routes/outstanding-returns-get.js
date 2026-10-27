import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { buildOutstandingReturnsTable } from '#market-insights/application/outstanding-returns.js'
import {
  monthlyPeriodParamsSchema,
  publishedMonthsThrough
} from './published-months.js'
import { outstandingReturnsResponseSchema } from './outstanding-returns-response.schema.js'

/** @import { HapiRequest, HapiResponseObject, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { ReportsRepository } from '#reports/repository/port.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */

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
   *   params: { year: Year, cadence: 'monthly', period: number },
   *   organisationsRepository: OrganisationsRepository,
   *   reportsRepository: ReportsRepository
   * }} request
   * @param {HapiResponseToolkit} h
   * @returns {Promise<HapiResponseObject>}
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

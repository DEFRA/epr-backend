import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { CADENCE } from '#reports/domain/cadence.js'
import { periodRefSchema } from '#reports/domain/period-ref.schema.js'
import { buildOutstandingReturnsTable } from '#market-insights/application/outstanding-returns.js'
import { outstandingReturnsResponseSchema } from './outstanding-returns-response.schema.js'
import { publishedMonthsThrough } from './published-months.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const marketInsightsOutstandingReturnsPath =
  '/v1/market-insights/{year}/{cadence}/{period}/outstanding-returns'

const OUTSTANDING_RETURNS = {
  name: 'outstanding returns',
  action: 'market_insights_outstanding_returns'
}

export const marketInsightsOutstandingReturnsGet = {
  method: 'GET',
  path: marketInsightsOutstandingReturnsPath,
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
    const {
      organisationsRepository,
      reportsRepository,
      params: { year, period }
    } = request

    const now = new Date()
    const table = await buildOutstandingReturnsTable({
      organisationsRepository,
      reportsRepository,
      months: publishedMonthsThrough(OUTSTANDING_RETURNS, year, period, now),
      now
    })

    return h.response(table).code(StatusCodes.OK)
  }
}

import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { buildReprocessorExporterTable } from '#market-insights/application/reprocessor-exporter-table.js'
import {
  monthlyPeriodParamsSchema,
  publishedMonthsThrough
} from './published-months.js'
import { reprocessorExporterFiguresResponseSchema } from './reprocessor-exporter-figures-response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const marketInsightsReprocessorExporterFiguresPath =
  '/v1/market-insights/{year}/{cadence}/{period}/reprocessor-exporter-figures'

export const marketInsightsReprocessorExporterFiguresGet = {
  method: 'GET',
  path: marketInsightsReprocessorExporterFiguresPath,
  options: {
    auth: {
      scope: [SCOPES.marketDataRead]
    },
    tags: ['api', 'market-insights'],
    validate: {
      params: monthlyPeriodParamsSchema
    },
    response: {
      schema: reprocessorExporterFiguresResponseSchema
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
    const { organisationsRepository, reportsRepository, logger, params } =
      request

    const now = new Date()
    const table = await buildReprocessorExporterTable({
      organisationsRepository,
      reportsRepository,
      logger,
      months: publishedMonthsThrough(
        params,
        now,
        'market_insights_reprocessor_exporter_figures'
      ),
      now
    })

    return h.response(table).code(StatusCodes.OK)
  }
}

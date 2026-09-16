import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { REGULATOR } from '#domain/organisations/model.js'
import { buildReprocessorExporterTable } from '#market-insights/application/reprocessor-exporter-table.js'
import {
  monthlyPeriodParamsSchema,
  publishedMonthsThrough
} from './published-months.js'
import { reprocessorExporterFiguresResponseSchema } from './reprocessor-exporter-figures-response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const marketInsightsReprocessorExporterFiguresPath =
  '/v1/market-insights/{year}/{cadence}/{period}/reprocessor-exporter-figures'

/**
 * The same figures narrowed to the accreditations the Environment Agency
 * holds. England is the one nation published on its own; the other three
 * would identify operators, so no other narrowing exists.
 */
export const marketInsightsEnglandReprocessorExporterFiguresPath = `${marketInsightsReprocessorExporterFiguresPath}/england`

/**
 * @param {Object} route
 * @param {string} route.path
 * @param {string} route.action - the logging event action of the route
 * @param {import('#domain/organisations/model.js').RegulatorValue} [route.regulator]
 */
const reprocessorExporterFiguresRoute = ({ path, action, regulator }) => ({
  method: 'GET',
  path,
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
      year: params.year,
      months: publishedMonthsThrough(params, now, action),
      regulator,
      now
    })

    return h.response(table).code(StatusCodes.OK)
  }
})

export const marketInsightsReprocessorExporterFiguresGet =
  reprocessorExporterFiguresRoute({
    path: marketInsightsReprocessorExporterFiguresPath,
    action: 'market_insights_reprocessor_exporter_figures'
  })

export const marketInsightsEnglandReprocessorExporterFiguresGet =
  reprocessorExporterFiguresRoute({
    path: marketInsightsEnglandReprocessorExporterFiguresPath,
    action: 'market_insights_england_reprocessor_exporter_figures',
    regulator: REGULATOR.EA
  })

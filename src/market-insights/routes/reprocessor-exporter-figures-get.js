import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { REGULATOR_FOR_NATION } from '#domain/organisations/model.js'
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
 * The same figures narrowed to one nation. A nation is served from the
 * regulator its operators registered with, which is the field the analysts
 * filter the published England tab on.
 */
export const marketInsightsNationReprocessorExporterFiguresPath = `${marketInsightsReprocessorExporterFiguresPath}/{nation}`

/**
 * The regulator each nation's path segment stands for. Every path under market
 * insights hyphenates, so the segment is the hyphenated spelling of the nation.
 */
const REGULATOR_FOR_NATION_SEGMENT = Object.freeze(
  Object.fromEntries(
    Object.entries(REGULATOR_FOR_NATION).map(([nation, regulator]) => [
      nation.replaceAll('_', '-'),
      regulator
    ])
  )
)

/**
 * The regulator a nation's figures are drawn from. The UK figures name no
 * nation, and are drawn from every regulator.
 *
 * @param {string} [nation] - the nation's path segment
 */
const regulatorForNation = (nation) =>
  nation === undefined ? undefined : REGULATOR_FOR_NATION_SEGMENT[nation]

const nationPeriodParamsSchema = monthlyPeriodParamsSchema.keys({
  nation: Joi.string()
    .valid(...Object.keys(REGULATOR_FOR_NATION_SEGMENT))
    .required()
})

/**
 * @param {Object} route
 * @param {string} route.path
 * @param {string} route.action - the logging event action of the route
 * @param {import('joi').ObjectSchema} route.paramsSchema
 */
const reprocessorExporterFiguresRoute = ({ path, action, paramsSchema }) => ({
  method: 'GET',
  path,
  options: {
    auth: {
      scope: [SCOPES.marketDataRead]
    },
    tags: ['api', 'market-insights'],
    validate: {
      params: paramsSchema
    },
    response: {
      schema: reprocessorExporterFiguresResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: { year: number, cadence: 'monthly', period: number, nation?: string },
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
      regulator: regulatorForNation(params.nation),
      now
    })

    return h.response(table).code(StatusCodes.OK)
  }
})

export const marketInsightsReprocessorExporterFiguresGet =
  reprocessorExporterFiguresRoute({
    path: marketInsightsReprocessorExporterFiguresPath,
    action: 'market_insights_reprocessor_exporter_figures',
    paramsSchema: monthlyPeriodParamsSchema
  })

export const marketInsightsNationReprocessorExporterFiguresGet =
  reprocessorExporterFiguresRoute({
    path: marketInsightsNationReprocessorExporterFiguresPath,
    action: 'market_insights_nation_reprocessor_exporter_figures',
    paramsSchema: nationPeriodParamsSchema
  })

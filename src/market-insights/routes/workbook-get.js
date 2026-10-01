import Joi from 'joi'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { buildMarketInsightsWorkbook } from '#market-insights/application/build-workbook.js'
import {
  monthlyPeriodParamsSchema,
  publishedMonthsThrough
} from './published-months.js'
import { marketInsightsDownloadDisposition } from './download-disposition.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const marketInsightsWorkbookPath =
  '/v1/market-insights/{year}/{cadence}/{period}/workbook.xlsx'

const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const marketInsightsWorkbookGet = {
  method: 'GET',
  path: marketInsightsWorkbookPath,
  options: {
    auth: {
      scope: [SCOPES.marketDataRead]
    },
    tags: ['api', 'market-insights'],
    validate: {
      params: monthlyPeriodParamsSchema,
      query: Joi.object({
        unredacted: Joi.boolean().default(false)
      })
    }
  },
  /**
   * The published market insights workbook for the year up to the requested
   * period, built within the request.
   *
   * Like the export archive, this takes tens of seconds, which is accepted for
   * the same reason: it is run occasionally, by one regulator who is waiting
   * for it.
   *
   * It is redacted unless asked for unredacted: redacted, it shows "[c]" in
   * place of every figure from too few operators. The full workbook is for
   * regulators to compare against.
   *
   * @param {HapiRequest & {
   *   params: { year: number, cadence: 'monthly', period: number },
   *   query: { unredacted: boolean },
   *   ledgerRepository: import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository,
   *   summaryLogRowStatesRepository: import('#waste-records/repository/port.js').SummaryLogRowStatesRepository,
   *   organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
   *   overseasSitesRepository: import('#overseas-sites/repository/port.js').OverseasSitesRepository,
   *   reportsRepository: import('#reports/repository/port.js').ReportsRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { params, query, logger } = request

    const now = new Date()
    const months = publishedMonthsThrough(
      params,
      now,
      'market_insights_workbook'
    )

    const workbook = await buildMarketInsightsWorkbook({
      ledgerRepository: request.ledgerRepository,
      summaryLogRowStatesRepository: request.summaryLogRowStatesRepository,
      organisationsRepository: request.organisationsRepository,
      overseasSitesRepository: request.overseasSitesRepository,
      reportsRepository: request.reportsRepository,
      logger,
      year: params.year,
      months,
      now,
      redacted: !query.unredacted
    })

    return h
      .response(Buffer.from(await workbook.xlsx.writeBuffer()))
      .type(XLSX_CONTENT_TYPE)
      .header(
        'Content-Disposition',
        marketInsightsDownloadDisposition(
          params,
          now,
          'xlsx',
          query.unredacted ? 'unredacted' : undefined
        )
      )
  }
}

import { SCOPES } from '#common/helpers/auth/constants.js'
import { buildMarketInsightsExportArchive } from '#market-insights/application/build-export-archive.js'
import {
  monthlyPeriodParamsSchema,
  publishedMonthsThrough
} from './published-months.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const marketInsightsExportZipPath =
  '/v1/market-insights/{year}/{cadence}/{period}/export.zip'

const ISO_SECONDS_LENGTH = 19

/**
 * Names the zip for the period it holds and the second it was taken, without
 * colons, following the convention `buildDownloadDisposition` set.
 *
 * @param {{ year: number, cadence: string, period: number }} params
 * @param {Date} now
 * @returns {string}
 */
const buildFilename = ({ year, cadence, period }, now) => {
  const taken = now
    .toISOString()
    .slice(0, ISO_SECONDS_LENGTH)
    .replace('T', '-')
    .replaceAll(':', '')

  return `market-insights-${year}-${cadence}-${period}-${taken}.zip`
}

export const marketInsightsExportZipGet = {
  method: 'GET',
  path: marketInsightsExportZipPath,
  options: {
    auth: {
      scope: [SCOPES.marketDataRead]
    },
    tags: ['api', 'market-insights'],
    validate: {
      params: monthlyPeriodParamsSchema
    }
  },
  /**
   * Every figure behind the market insights pages, as a zip of CSVs, built and
   * streamed within the request.
   *
   * This takes tens of seconds. It is accepted: the export is run occasionally,
   * by one regulator at a time, who is waiting for it.
   *
   * @param {HapiRequest & {
   *   params: { year: number, cadence: 'monthly', period: number },
   *   ledgerRepository: import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository,
   *   summaryLogRowStatesRepository: import('#waste-records/repository/port.js').SummaryLogRowStatesRepository,
   *   organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
   *   overseasSitesRepository: import('#overseas-sites/repository/port.js').OverseasSitesRepository,
   *   reportsRepository: import('#reports/repository/port.js').ReportsRepository
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { params, logger } = request

    const now = new Date()
    // Rejects a period that has not ended, before any figure work starts.
    const months = publishedMonthsThrough(params, now, 'market_insights_export')

    const archive = await buildMarketInsightsExportArchive({
      ledgerRepository: request.ledgerRepository,
      summaryLogRowStatesRepository: request.summaryLogRowStatesRepository,
      organisationsRepository: request.organisationsRepository,
      overseasSitesRepository: request.overseasSitesRepository,
      reportsRepository: request.reportsRepository,
      logger,
      year: params.year,
      cadence: params.cadence,
      period: params.period,
      months,
      now
    })

    return h
      .response(archive)
      .type('application/zip')
      .header(
        'Content-Disposition',
        `attachment; filename="${buildFilename(params, now)}"`
      )
  }
}

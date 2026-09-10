import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { buildWasteBalanceTable } from '#market-insights/application/waste-balance-table.js'
import { wasteBalanceResponseSchema } from './waste-balance-response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const marketInsightsWasteBalancePath =
  '/v1/market-insights/waste-balance'

export const marketInsightsWasteBalanceGet = {
  method: 'GET',
  path: marketInsightsWasteBalancePath,
  options: {
    auth: {
      scope: [SCOPES.marketDataRead]
    },
    tags: ['api', 'market-insights'],
    validate: {
      query: Joi.object({
        year: Joi.number().integer().min(2000).max(9999).required()
      })
    },
    response: {
      schema: wasteBalanceResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   query: { year: number },
   *   ledgerRepository: import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository,
   *   summaryLogRowStatesRepository: import('#waste-records/repository/port.js').SummaryLogRowStatesRepository,
   *   organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository,
   *   overseasSitesRepository: import('#overseas-sites/repository/port.js').OverseasSitesRepository
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
      logger,
      query
    } = request

    const table = await buildWasteBalanceTable({
      ledgerRepository,
      summaryLogRowStatesRepository,
      organisationsRepository,
      overseasSitesRepository,
      logger,
      reportingYear: query.year,
      now: new Date()
    })

    return h.response(table).code(StatusCodes.OK)
  }
}

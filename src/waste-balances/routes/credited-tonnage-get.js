import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { buildCreditedTonnageReport } from '#waste-balances/application/credited-tonnage-report.js'
import { creditedTonnageResponseSchema } from './credited-tonnage-response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const creditedTonnageGetPath =
  '/v1/admin/waste-balances/credited-tonnage'

// A reporting month is a year and a calendar month. The year runs 2000 to 9999,
// as it does on the market-insights waste balance: one before packaging waste
// was reported at all is a typo.
const REPORTING_MONTH_PATTERN = /^[2-9]\d{3}-(0[1-9]|1[0-2])$/

export const creditedTonnageGet = {
  method: 'GET',
  path: creditedTonnageGetPath,
  options: {
    auth: {
      scope: [SCOPES.adminRead]
    },
    tags: ['api', 'admin'],
    validate: {
      query: Joi.object({
        month: Joi.string().pattern(REPORTING_MONTH_PATTERN)
      })
    },
    response: {
      schema: creditedTonnageResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   query: { month?: string },
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

    const report = await buildCreditedTonnageReport({
      ledgerRepository,
      summaryLogRowStatesRepository,
      organisationsRepository,
      overseasSitesRepository,
      logger,
      now: new Date(),
      reportingMonth: query.month
    })

    return h.response(report).code(StatusCodes.OK)
  }
}

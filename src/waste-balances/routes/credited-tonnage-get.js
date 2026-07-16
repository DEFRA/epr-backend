import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { buildCreditedTonnageReport } from '#waste-balances/application/credited-tonnage-report.js'
import { creditedTonnageResponseSchema } from './credited-tonnage-response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const creditedTonnageGetPath =
  '/v1/admin/waste-balances/credited-tonnage'

export const creditedTonnageGet = {
  method: 'GET',
  path: creditedTonnageGetPath,
  options: {
    auth: {
      scope: [SCOPES.adminRead]
    },
    tags: ['api', 'admin'],
    response: {
      schema: creditedTonnageResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   ledgerRepository: import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository,
   *   summaryLogRowStatesRepository: import('#waste-records/repository/port.js').SummaryLogRowStateRepository,
   *   organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository
   * }} request
   * @param {HapiResponseToolkit} h
   * @returns {Promise<import('#common/hapi-types.js').HapiResponseObject>}
   */
  handler: async (request, h) => {
    const {
      ledgerRepository,
      summaryLogRowStatesRepository,
      organisationsRepository,
      logger
    } = request

    const report = await buildCreditedTonnageReport({
      ledgerRepository,
      summaryLogRowStateRepository: summaryLogRowStatesRepository,
      organisationsRepository,
      logger,
      now: new Date()
    })

    return h.response(report).code(StatusCodes.OK)
  }
}

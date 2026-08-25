import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { readLedger } from '#waste-balances/application/read-ledger.js'
import { wasteBalanceLedgerResponseSchema } from '../waste-balance-ledger-response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const registrationWasteBalanceLedgerGetPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/waste-balance-ledger'

export const registrationWasteBalanceLedgerGet = {
  method: 'GET',
  path: registrationWasteBalanceLedgerGetPath,
  options: {
    auth: {
      scope: [
        `+${SCOPES.organisationRead}`,
        `+${SCOPES.wasteBalanceLedgerRead}`
      ]
    },
    tags: ['api'],
    response: {
      schema: wasteBalanceLedgerResponseSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: { organisationId: string, registrationId: string }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { ledgerRepository } = request
    const { organisationId, registrationId } = request.params

    const ledger = await readLedger(ledgerRepository, {
      organisationId,
      registrationId,
      accreditationId: null
    })

    return h.response(ledger).code(StatusCodes.OK)
  }
}

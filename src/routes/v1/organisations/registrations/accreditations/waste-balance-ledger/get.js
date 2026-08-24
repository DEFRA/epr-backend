import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { readLedger } from '#waste-balances/application/read-ledger.js'
import { wasteBalanceLedgerResponseSchema } from '../../waste-balance-ledger-response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const accreditationWasteBalanceLedgerGetPath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/waste-balance-ledger'

export const accreditationWasteBalanceLedgerGet = {
  method: 'GET',
  path: accreditationWasteBalanceLedgerGetPath,
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
   *   params: { organisationId: string, registrationId: string, accreditationId: string }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { ledgerRepository } = request
    const { organisationId, registrationId, accreditationId } = request.params

    const ledger = await readLedger(ledgerRepository, {
      organisationId,
      registrationId,
      accreditationId
    })

    return h.response(ledger).code(StatusCodes.OK)
  }
}

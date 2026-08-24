import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { readLedger } from '#waste-balances/application/read-ledger.js'
import { ledgerEventsResponseSchema } from '../ledger-events-response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const registrationLedgerEventsGetPath =
  '/v1/admin/organisations/{organisationId}/registrations/{registrationId}/waste-balance-events'

export const registrationLedgerEventsGet = {
  method: 'GET',
  path: registrationLedgerEventsGetPath,
  options: {
    auth: {
      scope: [
        `+${SCOPES.organisationRead}`,
        `+${SCOPES.wasteBalanceLedgerRead}`
      ]
    },
    tags: ['api', 'admin'],
    response: {
      schema: ledgerEventsResponseSchema
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

import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { createLedgerView } from '#waste-balances/application/ledger-view.js'
import { ledgerEventsResponseSchema } from '../../ledger-events-response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const accreditationLedgerEventsGetPath =
  '/v1/admin/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/waste-balance-events'

export const accreditationLedgerEventsGet = {
  method: 'GET',
  path: accreditationLedgerEventsGetPath,
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
   *   params: { organisationId: string, registrationId: string, accreditationId: string }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { ledgerRepository } = request
    const { organisationId, registrationId, accreditationId } = request.params

    const ledgerView = createLedgerView({ ledgerRepository })

    const ledger = await ledgerView.read({
      organisationId,
      registrationId,
      accreditationId
    })

    return h.response(ledger).code(StatusCodes.OK)
  }
}

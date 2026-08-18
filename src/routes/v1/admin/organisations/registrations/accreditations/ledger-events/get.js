import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const accreditationLedgerEventsGetPath =
  '/v1/admin/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/waste-balance-events'

export const accreditationLedgerEventsGet = {
  method: 'GET',
  path: accreditationLedgerEventsGetPath,
  options: {
    auth: {
      scope: [SCOPES.adminRead, SCOPES.wasteBalanceLedgerRead]
    },
    tags: ['api', 'admin']
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

    const events = await ledgerRepository.findAllInLedger({
      organisationId,
      registrationId,
      accreditationId
    })

    return h.response(events).code(StatusCodes.OK)
  }
}

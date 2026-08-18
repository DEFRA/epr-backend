import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const registrationLedgerEventsGetPath =
  '/v1/admin/organisations/{organisationId}/registrations/{registrationId}/waste-balance-events'

export const registrationLedgerEventsGet = {
  method: 'GET',
  path: registrationLedgerEventsGetPath,
  options: {
    auth: {
      scope: [SCOPES.adminRead, SCOPES.organisationRead]
    },
    tags: ['api', 'admin']
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

    const events = await ledgerRepository.findAllInLedger({
      organisationId,
      registrationId,
      accreditationId: null
    })

    return h.response(events).code(StatusCodes.OK)
  }
}

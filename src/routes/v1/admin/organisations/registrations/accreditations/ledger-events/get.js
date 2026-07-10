import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'

export const ledgerEventsGetPath =
  '/v1/admin/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/waste-balance-events'

export const ledgerEventsGet = {
  method: 'GET',
  path: ledgerEventsGetPath,
  options: {
    auth: {
      scope: [SCOPES.adminRead]
    },
    tags: ['api', 'admin']
  },
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

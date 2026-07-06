import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'

export const streamEventsGetPath =
  '/v1/admin/registrations/{registrationId}/accreditations/{accreditationId}/waste-balance-events'

export const streamEventsGet = {
  method: 'GET',
  path: streamEventsGetPath,
  options: {
    auth: {
      scope: [SCOPES.adminRead]
    },
    tags: ['api', 'admin']
  },
  handler: async (request, h) => {
    const { ledgerRepository } = request
    const { registrationId, accreditationId } = request.params

    const events = await ledgerRepository.findAllInLedger(
      registrationId,
      accreditationId
    )

    return h.response(events).code(StatusCodes.OK)
  }
}

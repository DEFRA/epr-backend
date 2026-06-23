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
    const { streamRepository } = request
    const { registrationId, accreditationId } = request.params

    const events = await streamRepository.findAllByPartition(
      registrationId,
      accreditationId
    )

    return h.response(events).code(StatusCodes.OK)
  }
}

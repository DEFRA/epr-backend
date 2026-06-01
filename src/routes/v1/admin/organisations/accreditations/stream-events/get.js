import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'

export const streamEventsGetPath =
  '/v1/admin/organisations/{organisationId}/accreditations/{accreditationId}/waste-balance-events'

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
    const { organisationsRepository, streamRepository } = request
    const { organisationId, accreditationId } = request.params

    const organisation = await organisationsRepository.findById(organisationId)

    const registration = organisation.registrations.find(
      (r) => r.accreditationId === accreditationId
    )

    if (!registration) {
      throw Boom.notFound(
        `No registration linked to accreditation ${accreditationId}`
      )
    }

    const events = await streamRepository.findAllByPartition(
      registration.id,
      accreditationId
    )

    return h.response(events).code(StatusCodes.OK)
  }
}

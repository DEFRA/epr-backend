import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { STATUS } from '#domain/organisations/model.js'
import { organisationsLinkPath } from '#domain/organisations/paths.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const organisationsLink = {
  method: 'POST',
  path: organisationsLinkPath,
  options: {
    auth: 'access-token'
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository, params: { orgId: string }}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request
    const { defraIdOrgId, organisationId } = h.request.server.app ?? {}

    if (!organisationId) {
      throw Boom.notFound('Organisation not found')
    }

    try {
      const organisation =
        await organisationsRepository.findById(organisationId)

      await organisationsRepository.update(
        organisation.id,
        organisation.version,
        {
          status: STATUS.ACTIVE,
          statusHistory: organisation.statusHistory,
          defraIdOrgId: `${defraIdOrgId}`,
          registrations: organisation.registrations.reduce(
            (prev, registration) =>
              registration.status === STATUS.APPROVED
                ? [...prev, { ...registration, status: STATUS.ACTIVE }]
                : prev,
            []
          ),
          accreditations: organisation.accreditations.reduce(
            (prev, accreditation) =>
              accreditation.status === STATUS.APPROVED
                ? [...prev, { ...accreditation, status: STATUS.ACTIVE }]
                : prev,
            []
          )
        }
      )

      return h.response(organisation).code(StatusCodes.OK)
    } catch (error) {
      throw Boom.boomify(error)
    }
  }
}

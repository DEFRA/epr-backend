import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'

import { STATUS } from '#domain/organisations/model.js'
import { organisationsLinkPath } from '#domain/organisations/paths.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const organisationsLink = {
  method: 'POST',
  path: organisationsLinkPath,
  options: {
    auth: {
      scope: [ROLES.linker]
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository, params: { orgId: string }}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { orgInToken } = request.server.app

    if (!orgInToken?.defraIdOrgId) {
      throw Boom.badImplementation(
        'currentRelationShipId is missing from credentials'
      )
    }

    const { organisationId } = request.params
    if (!organisationId) {
      throw Boom.badRequest('Organisation id is missing in request')
    }

    const { organisationsRepository } = request
    const organisation = await organisationsRepository.findById(organisationId)

    if (!organisation) {
      throw Boom.notFound('Organisation not found')
    }

    if (organisation.status !== STATUS.APPROVED) {
      console.log('organisation.statusHistory', organisation.statusHistory)
      console.log('organisation.status', organisation.status)
      throw Boom.conflict('Organisation is not in an approvable state')
    }

    try {
      const linkedDefraOrg = {
        orgId: orgInToken.defraIdOrgId,
        orgName: orgInToken.defraIdOrgName,
        linkedBy: {
          email: request.auth.credentials.email,
          id: request.auth.credentials.id
        },
        linkedAt: new Date().toISOString()
      }

      await organisationsRepository.update(
        organisation.id,
        organisation.version,
        {
          status: STATUS.ACTIVE,
          linkedDefraOrganisation: linkedDefraOrg,
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

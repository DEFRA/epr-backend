import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const organisationsGetByIdPath = '/v1/organisations/{orgId}'

export const organisationsGetById = {
  method: 'GET',
  path: organisationsGetByIdPath,
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository, params: { orgId: string }}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request

    const orgId = request.params.orgId.trim()

    if (!orgId) {
      throw Boom.notFound('Organisation not found')
    }

    const organisation = await organisationsRepository.findByOrgId(orgId)
    if (!organisation) {
      throw Boom.notFound('Organisation not found')
    }

    return h.response(organisation).code(StatusCodes.OK)
  }
}

import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'
import { config } from '../../../config.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const organisationsGetByIdPath = '/v1/organisations/{organisationId}'

export const organisationsGetById = {
  method: 'GET',
  path: organisationsGetByIdPath,
  options: config.get('isTest')
    ? {}
    : {
    auth: {
      scope: [ROLES.serviceMaintainer, 'user']
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository, params: { orgId: string }}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request

    const id = request.params.organisationId.trim()

    if (!id) {
      throw Boom.notFound('Organisation not found')
    }

    const organisation = await organisationsRepository.findById(id)

    return h.response(organisation).code(StatusCodes.OK)
  }
}

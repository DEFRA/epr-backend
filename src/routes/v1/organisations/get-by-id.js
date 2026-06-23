import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { ROLES, SCOPES } from '#common/helpers/auth/constants.js'
import { STRATEGY_NAME as BASIC_AUTH } from '#plugins/auth/basic-auth-plugin.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const organisationsGetByIdPath = '/v1/organisations/{organisationId}'

export const organisationsGetById = {
  method: 'GET',
  path: organisationsGetByIdPath,
  options: {
    auth: {
      strategies: ['access-token', BASIC_AUTH],
      scope: [ROLES.standardUser, SCOPES.adminRead, SCOPES.organisationRead]
    },
    tags: ['api', 'admin']
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   organisationsRepository: OrganisationsRepository,
   *   params: { organisationId: string }
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request

    const organisationId = request.params.organisationId.trim()

    if (!organisationId) {
      throw Boom.notFound('Organisation not found')
    }

    const organisation = await organisationsRepository.findById(organisationId)

    return h.response(organisation).code(StatusCodes.OK)
  }
}

import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { config } from '../../../config.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const organisationsGetAllByDefraIdOrgIdPath =
  '/v1/organisations/{defraIdOrgId}/defra-id-org-id'

export const organisationsGetAllByDefraIdOrgId = {
  method: 'GET',
  path: organisationsGetAllByDefraIdOrgIdPath,
  options: config.get('isTest')
    ? {}
    : {
        auth: {
          // strategy: 'access-token',
          strategy: 'access-token', // @todo: workaround for strategy-delegation not allowing h.response()
          access: {
            // only permit access to this endpoint if (logged in) user has either the service_maintainer or user scope
            scope: ['service_maintainer', 'user']
          }
        }
      },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository, params: { orgId: string }}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository, params } = request

    const { defraIdOrgId } = params

    request.logger.info(
      { defraIdOrgId },
      'DEBUG: organisationsGetAllByDefraIdOrgId'
    )

    if (!defraIdOrgId) {
      throw Boom.notFound('Organisations not found')
    }

    const organisations =
      await organisationsRepository.findAllByDefraIdOrgId(defraIdOrgId)

    request.logger.info(
      { organisations },
      'DEBUG: organisationsGetAllByDefraIdOrgId'
    )

    return h.response(organisations).code(StatusCodes.OK)
  }
}

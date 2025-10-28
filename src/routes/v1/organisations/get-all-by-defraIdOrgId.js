import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { config } from '../../../config.js'
import { ROLES } from '#common/helpers/auth/constants.js'

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
          access: {
            scope: [ROLES.serviceMaintainer, ROLES.standardUser]
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

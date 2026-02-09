import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'
import { linkedOrganisationsResponseSchema } from './response.schema.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const linkedOrganisationsGetAllPath = '/v1/linked-organisations'

export const linkedOrganisationsGetAll = {
  method: 'GET',
  path: linkedOrganisationsGetAllPath,
  options: {
    auth: {
      scope: [ROLES.serviceMaintainer]
    },
    tags: ['api', 'admin'],
    response: {
      schema: linkedOrganisationsResponseSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async ({ organisationsRepository }, h) => {
    const organisations = await organisationsRepository.findAllLinked()

    return h.response(organisations).code(StatusCodes.OK)
  }
}

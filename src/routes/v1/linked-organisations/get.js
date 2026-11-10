import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { isTestOrganisation } from '#common/helpers/parse-test-organisations.js'
import { linkedOrganisationsResponseSchema } from './response.schema.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const linkedOrganisationsGetAllPath = '/v1/linked-organisations'

export const linkedOrganisationsGetAll = {
  method: 'GET',
  path: linkedOrganisationsGetAllPath,
  options: {
    auth: {
      scope: [SCOPES.adminRead]
    },
    tags: ['api', 'admin'],
    validate: {
      query: Joi.object({
        name: Joi.string().optional().allow('').trim()
      })
    },
    response: {
      schema: linkedOrganisationsResponseSchema
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   organisationsRepository: OrganisationsRepository,
   *   query: { name?: string }
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { name } = request.query
    const filter = name ? { name } : undefined
    const organisations =
      await request.organisationsRepository.findAllLinked(filter)
    const filtered = organisations
      .filter((org) => !isTestOrganisation(org))
      .map(({ organisationNumber, ...org }) => ({
        ...org,
        orgId: Number(organisationNumber)
      }))

    return h.response(filtered).code(StatusCodes.OK)
  }
}

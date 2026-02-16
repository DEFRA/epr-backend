import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { linkedOrganisationsResponseSchema } from './response.schema.js'

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)

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
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { name } = request.query
    const filter = name ? { name } : undefined
    const organisations =
      await request.organisationsRepository.findAllLinked(filter)
    const filtered = organisations.filter(
      (org) => !TEST_ORGANISATIONS.has(org.orgId)
    )

    return h.response(filtered).code(StatusCodes.OK)
  }
}

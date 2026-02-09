import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'
import { linkedOrganisationsResponseSchema } from './response.schema.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

const toLinkedOrganisationSummary = (org) => ({
  id: org.id,
  orgId: org.orgId,
  companyDetails: {
    name: org.companyDetails.name
  },
  status: org.status,
  linkedDefraOrganisation: org.linkedDefraOrganisation
})

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

    return h
      .response(organisations.map(toLinkedOrganisationSummary))
      .code(StatusCodes.OK)
  }
}

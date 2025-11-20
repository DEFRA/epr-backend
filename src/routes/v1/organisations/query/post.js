import { StatusCodes } from 'http-status-codes'
import { ROLES } from '#common/helpers/auth/constants.js'
import Joi from 'joi'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const organisationsQueryPath = '/v1/organisations/query'

const querySchema = Joi.object({
  filter: Joi.object().required()
}).required()

export const organisationsQuery = {
  method: 'POST',
  path: organisationsQueryPath,
  options: {
    auth: {
      scope: [ROLES.serviceMaintainer]
    },
    validate: {
      payload: querySchema,
      failAction: async (request, h, err) => {
        throw err
      }
    }
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async ({ organisationsRepository, payload }, h) => {
    const { filter } = payload
    const organisations = await organisationsRepository.query(filter)

    return h.response(organisations).code(StatusCodes.OK)
  }
}

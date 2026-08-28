import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { toRegistrationsResource } from '../registration-resource.js'
import { registrationsResponseSchema } from '../response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const registrationsListPath =
  '/v1/organisations/{organisationId}/registrations'

export const registrationsList = {
  method: 'GET',
  path: registrationsListPath,
  options: {
    auth: { scope: [SCOPES.organisationRead] },
    tags: ['api'],
    response: {
      schema: registrationsResponseSchema
    }
  },
  /**
   * @param {HapiRequest & { params: { organisationId: string } }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request

    const organisation = await organisationsRepository.findById(
      request.params.organisationId
    )

    return h
      .response({ registrations: toRegistrationsResource(organisation) })
      .code(StatusCodes.OK)
  }
}

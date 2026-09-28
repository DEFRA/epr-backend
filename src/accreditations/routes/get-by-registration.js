import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { STRATEGY_NAME as BASIC_AUTH } from '#plugins/auth/basic-auth-plugin.js'
import { findLocalAccreditation } from '../application/local-accreditations.js'
import { accreditationRecordSchema } from '../model.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const registrationAccreditationForYearPath =
  '/v1/registrations/{registrationId}/accreditation/{year}'

/**
 * The accreditation a registration holds for a scheme year, whatever its
 * status. A registration holds at most one per year, so this is a single
 * resource rather than a collection.
 *
 * Service-to-service only: the caller is another service reading accreditation
 * data, never an operator, so only basic auth is accepted.
 */
export const registrationAccreditationForYearGet = {
  method: 'GET',
  path: registrationAccreditationForYearPath,
  options: {
    auth: {
      strategies: [BASIC_AUTH],
      scope: [SCOPES.organisationRead]
    },
    tags: ['api'],
    validate: {
      params: Joi.object({
        registrationId: Joi.string().required(),
        year: Joi.number().integer().min(2000).max(2100).required()
      })
    },
    response: {
      schema: accreditationRecordSchema
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: { registrationId: string, year: number }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationsRepository, params } = request

    const accreditation = await findLocalAccreditation(
      organisationsRepository,
      params
    )

    if (!accreditation) {
      throw Boom.notFound(
        `No accreditation for registration ${params.registrationId} in ${params.year}`
      )
    }

    return h.response(accreditation).code(StatusCodes.OK)
  }
}

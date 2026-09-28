import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { STRATEGY_NAME as BASIC_AUTH } from '#plugins/auth/basic-auth-plugin.js'
import { listLocalAccreditations } from '../application/local-accreditations.js'
import { accreditationResponseSchema, MAX_YEAR, MIN_YEAR } from '../model.js'
import { holdingRepository } from './holding-repository.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const accreditationsListPath = '/v1/accreditations'

/**
 * Every accreditation held for a scheme year, for a caller that needs many at
 * once — a report over every organisation — without a request per
 * registration. `registrationId` may be repeated to narrow the list to those
 * registrations.
 *
 * Service-to-service only, as for the single-registration read.
 */
export const accreditationsList = {
  method: 'GET',
  path: accreditationsListPath,
  options: {
    auth: {
      strategies: [BASIC_AUTH],
      scope: [SCOPES.organisationRead]
    },
    tags: ['api'],
    validate: {
      query: Joi.object({
        year: Joi.number().integer().min(MIN_YEAR).max(MAX_YEAR).required(),
        registrationId: Joi.array().items(Joi.string()).single()
      })
    },
    response: {
      schema: Joi.array()
        .items(accreditationResponseSchema)
        .label('Accreditations')
    }
  },
  /**
   * @param {HapiRequest & {
   *   query: { year: number, registrationId?: string[] }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { query } = request

    const accreditations = await listLocalAccreditations(
      holdingRepository(request),
      { year: query.year, registrationIds: query.registrationId }
    )

    return h.response(accreditations).code(StatusCodes.OK)
  }
}

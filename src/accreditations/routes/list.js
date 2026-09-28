import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { STRATEGY_NAME as BASIC_AUTH } from '#plugins/auth/basic-auth-plugin.js'
import { listLocalAccreditations } from '../application/local-accreditations.js'
import { accreditationRecordSchema } from '../model.js'
import { holdingRepository } from './holding-repository.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

export const accreditationsListPath = '/v1/accreditations'

const DEFAULT_PAGE_SIZE = 100
const MAX_PAGE_SIZE = 500

/**
 * The accreditations held for a scheme year, a page at a time, for a caller
 * that needs many at once — a report over every organisation — without a
 * request per registration. `registrationId` may be repeated to narrow the
 * page to those registrations.
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
        year: Joi.number().integer().min(2000).max(2100).required(),
        registrationId: Joi.array().items(Joi.string()).single(),
        page: Joi.number().integer().min(1).default(1),
        pageSize: Joi.number()
          .integer()
          .min(1)
          .max(MAX_PAGE_SIZE)
          .default(DEFAULT_PAGE_SIZE)
      })
    },
    response: {
      schema: Joi.object({
        items: Joi.array().items(accreditationRecordSchema).required(),
        page: Joi.number().required(),
        pageSize: Joi.number().required(),
        totalItems: Joi.number().required(),
        totalPages: Joi.number().required()
      }).label('AccreditationsPage')
    }
  },
  /**
   * @param {HapiRequest & {
   *   query: { year: number, registrationId?: string[], page: number, pageSize: number }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    console.log('WAC list ')
    const { query } = request

    const result = await listLocalAccreditations(holdingRepository(request), {
      year: query.year,
      registrationIds: query.registrationId,
      page: query.page,
      pageSize: query.pageSize
    })

    return h.response(result).code(StatusCodes.OK)
  }
}

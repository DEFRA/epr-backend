import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

/** @import {HapiRequest} from '#common/hapi-types.js' */
/** @import {NonProdDataReset} from '#non-prod-data-reset/mongodb.js' */

/**
 * @typedef {HapiRequest & {
 *   nonProdDataReset: NonProdDataReset
 *   params: { id: number }
 * }} DeleteByIdRequest
 */

export const devOrganisationsDeleteByIdPath = '/v1/dev/organisations/{id}'

const POSITIVE_INTEGER_MESSAGE = '{#label} must be a positive integer'

const params = Joi.object({
  id: Joi.number().integer().positive().required()
}).messages({
  'any.required': '{#label} is required',
  'number.base': POSITIVE_INTEGER_MESSAGE,
  'number.integer': POSITIVE_INTEGER_MESSAGE,
  'number.positive': POSITIVE_INTEGER_MESSAGE
})

export const devOrganisationsDeleteById = {
  method: 'DELETE',
  path: devOrganisationsDeleteByIdPath,
  options: {
    auth: false,
    tags: ['api'],
    validate: {
      params
    }
  },

  /**
   * @param {DeleteByIdRequest} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { id } = request.params
    const deletedCounts = await request.nonProdDataReset.deleteByOrgId(id)
    return h.response({ orgId: id, deletedCounts }).code(StatusCodes.OK)
  }
}

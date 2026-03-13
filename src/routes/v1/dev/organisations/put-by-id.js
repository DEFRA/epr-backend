import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

/** @import {HapiRequest} from '#common/hapi-types.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */

/**
 * @typedef {HapiRequest & {
 *   organisationsRepository: OrganisationsRepository
 *   params: { id: string }
 *   payload: { organisation: Object }
 * }} PutByIdRequest
 */

export const devOrganisationsPutByIdPath = '/v1/dev/organisations/{id}'

const params = Joi.object({
  id: Joi.string().trim().min(1).required()
}).messages({
  'any.required': '{#label} is required',
  'string.empty': '{#label} cannot be empty',
  'string.min': '{#label} cannot be empty'
})

const payload = Joi.object({
  organisation: Joi.object().required()
}).messages({
  'any.required': '{#label} is required',
  'object.base': '{#label} must be an object'
})

export const devOrganisationsPutById = {
  method: 'PUT',
  path: devOrganisationsPutByIdPath,
  options: {
    auth: false,
    tags: ['api'],
    validate: {
      params,
      payload
    }
  },

  /**
   * @param {PutByIdRequest} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request

    const { id } = request.params

    const current = await organisationsRepository.findById(id)

    const { organisation } = request.payload

    const { id: _, version: _v, ...document } = organisation

    try {
      await organisationsRepository.replaceRaw(id, current.version, document)
      const updated = await organisationsRepository.findById(
        id,
        current.version + 1
      )
      return h.response({ organisation: updated }).code(StatusCodes.OK)
    } catch (error) {
      throw Boom.boomify(error)
    }
  }
}

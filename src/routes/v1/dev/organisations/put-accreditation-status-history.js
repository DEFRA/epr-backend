import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'
import { statusHistoryItemSchema } from '#repositories/organisations/schema/base.js'

/** @import {HapiRequest} from '#common/hapi-types.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */

/**
 * @typedef {HapiRequest & {
 *   organisationsRepository: OrganisationsRepository
 *   params: { id: string, accreditationId: string }
 *   payload: { statusHistory: Array<{status: string, updatedAt: string}> }
 * }} PutAccreditationStatusHistoryRequest
 */

export const devOrganisationsPutAccreditationStatusHistoryPath =
  '/v1/dev/organisations/{id}/accreditations/{accreditationId}/status-history'

const params = Joi.object({
  id: Joi.string().trim().min(1).required(),
  accreditationId: Joi.string().trim().min(1).required()
}).messages({
  'any.required': '{#label} is required',
  'string.empty': '{#label} cannot be empty',
  'string.min': '{#label} cannot be empty'
})

const payload = Joi.object({
  statusHistory: Joi.array().items(statusHistoryItemSchema).min(1).required()
}).messages({
  'any.required': '{#label} is required',
  'array.min': '{#label} must contain at least 1 item'
})

export const devOrganisationsPutAccreditationStatusHistory = {
  method: 'PUT',
  path: devOrganisationsPutAccreditationStatusHistoryPath,
  options: {
    auth: false,
    tags: ['api'],
    validate: {
      params,
      payload
    }
  },

  /**
   * @param {PutAccreditationStatusHistoryRequest} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request
    const { id, accreditationId } = request.params
    const { statusHistory } = request.payload

    const org = await organisationsRepository.findById(id)

    const accreditation = org.accreditations?.find(
      (a) => a.id === accreditationId
    )

    if (!accreditation) {
      throw Boom.notFound(`Accreditation with id ${accreditationId} not found`)
    }

    await organisationsRepository.replaceAccreditationStatusHistory(
      id,
      accreditationId,
      org.version,
      statusHistory
    )
    const updated = await organisationsRepository.findById(id, org.version + 1)
    return h.response({ organisation: updated }).code(StatusCodes.OK)
  }
}

import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'
import keyBy from 'lodash.keyby'
import mergeWith from 'lodash.mergewith'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */

/**
 * Organisation update payload with system fields removed
 * @typedef {Partial<Omit<Organisation, 'id'|'version'|'schemaVersion'|'status'|'statusHistory'>>} OrganisationUpdateFragment
 */

export const devOrganisationsPatchByIdPath = '/v1/dev/organisations/{id}'

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

const mergeCollectionById = (existingArray, updatesArray) => {
  const existingById = keyBy(existingArray, 'id')
  return updatesArray.map((update) => ({
    ...existingById[update.id],
    ...update
  }))
}

const customMerger = (objValue, srcValue, key) => {
  if (key === 'registrations' || key === 'accreditations') {
    return srcValue ? mergeCollectionById(objValue || [], srcValue) : objValue
  }

  if (Array.isArray(srcValue)) {
    return srcValue
  }
}

export const devOrganisationsPatchById = {
  method: 'PATCH',
  path: devOrganisationsPatchByIdPath,
  options: {
    auth: false,
    validate: {
      params,
      payload,
      failAction: (_request, _h, err) => {
        throw Boom.badData(err.message)
      }
    }
  },

  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository, params: { orgId: string }}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request

    const { id } = request.params

    const current = await organisationsRepository.findById(id)

    const { organisation } = request.payload

    const merged = mergeWith({}, current, organisation, customMerger)

    const { id: _, version: _v, ...updates } = merged

    try {
      await organisationsRepository.replace(id, current.version, updates)
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

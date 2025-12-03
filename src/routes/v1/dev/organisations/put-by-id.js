import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'
import { produce } from 'immer'

import { mergeSubcollection } from '#repositories/organisations/helpers.js'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */

/**
 * Organisation update payload with system fields removed
 * @typedef {Partial<Omit<Organisation, 'id'|'version'|'schemaVersion'|'status'|'statusHistory'>>} OrganisationUpdateFragment
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

const deepMerge = (current, updates) => {
  return produce(current, (draft) => {
    const merge = (draftObj, sourceObj) => {
      for (const key in sourceObj) {
        const value = sourceObj[key]

        if (
          (key === 'registrations' || key === 'accreditations') &&
          Array.isArray(value)
        ) {
          draftObj[key] = mergeSubcollection(draftObj[key] || [], value)
        } else if (
          value &&
          typeof value === 'object' &&
          !Array.isArray(value)
        ) {
          if (!draftObj[key] || typeof draftObj[key] !== 'object') {
            draftObj[key] = {}
          }
          merge(draftObj[key], value)
        } else {
          draftObj[key] = value
        }
      }
    }
    merge(draft, updates)
  })
}

export const devOrganisationsPutById = {
  method: 'PUT',
  path: devOrganisationsPutByIdPath,
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

    const {
      version: _v,
      id: _,
      schemaVersion: _s,
      ...sanitisedFragment
    } = organisation

    /** @type {Organisation} */
    const merged = deepMerge(current, sanitisedFragment)

    const { version: __v, id: __id, schemaVersion: __s, ...updates } = merged

    try {
      await organisationsRepository.update(id, current.version, updates)
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

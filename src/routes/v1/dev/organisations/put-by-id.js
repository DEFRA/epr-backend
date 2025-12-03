import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */

/**
 * Organisation update payload with system fields removed
 * @typedef {Partial<Omit<Organisation, 'id'|'version'|'schemaVersion'|'status'|'statusHistory'>>} OrganisationUpdateFragment
 */

export const devOrganisationsPutByIdPath = '/v1/dev/organisations/{id}'

const validateMyPayload = (payload) => {
  if (typeof payload.version !== 'number') {
    throw Boom.badRequest('Payload must include a numeric version field')
  }

  if (
    typeof payload.updateFragment !== 'object' ||
    payload.updateFragment === null
  ) {
    throw Boom.badRequest('Payload must include an updateFragment object')
  }

  return payload
}

export const devOrganisationsPutById = {
  method: 'PUT',
  path: devOrganisationsPutByIdPath,
  options: {
    auth: false,
    validate: {
      payload: validateMyPayload
    }
  },

  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository, params: { orgId: string }}} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request

    const id = request.params.id.trim()

    if (!id) {
      throw Boom.notFound('Organisation not found')
    }

    const { version, updateFragment } = request.payload

    const {
      version: _v,
      id: _,
      schemaVersion: _s,
      ...sanitisedFragment
    } = updateFragment

    /** @type {OrganisationUpdateFragment} */
    const updates = sanitisedFragment

    try {
      await organisationsRepository.update(id, version, updates)
      const updated = await organisationsRepository.findById(id, version + 1)
      return h.response(updated).code(StatusCodes.OK)
    } catch (error) {
      throw Boom.boomify(error)
    }
  }
}

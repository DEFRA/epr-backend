import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const organisationsPutByIdPath = '/v1/organisations/{id}'

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

export const organisationsPutById = {
  method: 'PUT',
  path: organisationsPutByIdPath,
  options: {
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

    try {
      await organisationsRepository.update(id, version, sanitisedFragment)
      const updated = await organisationsRepository.findById(id)
      return h.response(updated).code(StatusCodes.OK)
    } catch (error) {
      throw Boom.boomify(error)
    }
  }
}

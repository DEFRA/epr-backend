import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

export const organisationsPatchByIdPath = '/v1/organisations/{id}'

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

export const organisationsPatchById = {
  method: 'PATCH',
  path: organisationsPatchByIdPath,
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

    let organisation
    try {
      await organisationsRepository.update(id, version, updateFragment)
      organisation = await organisationsRepository.findById(id)
    } catch (error) {
      // Not happy letting the client know all the details of the mongo error
      console.log('error', error)
      // TODO: Should we add joi errors in a different way?
      throw Boom.boomify(error)
    }

    return h.response(organisation).code(StatusCodes.OK)
  }
}

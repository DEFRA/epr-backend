import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import * as jsondiffpatch from 'jsondiffpatch'
import * as jsonpatchFormatter from 'jsondiffpatch/formatters/jsonpatch'

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

    const jsondiffpatchInstance = jsondiffpatch.create({
      propertyFilter: function (name) {
        return name !== 'version'
      }
    })

    let diff = ''
    try {
      const previousVersion = await organisationsRepository.findById(id)
      await organisationsRepository.update(id, version, updateFragment)
      const newVersion = await organisationsRepository.findById(id)
      const delta = jsondiffpatchInstance.diff(previousVersion, newVersion)
      diff = jsonpatchFormatter.format(delta)
    } catch (error) {
      throw Boom.boomify(error)
    }

    return h.response(diff).code(StatusCodes.OK)
  }
}

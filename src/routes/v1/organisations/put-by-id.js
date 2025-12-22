import { ROLES } from '#common/helpers/auth/constants.js'
import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { auditOrganisationUpdate } from '#root/auditing/index.js'

/** @import {Organisation} from '#domain/organisations/model.js' */

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('#repositories/system-logs/port.js').SystemLogsRepository} SystemLogsRepository */

/**
 * Organisation update payload with system fields removed
 * @typedef {Partial<Omit<Organisation, 'id'|'version'|'schemaVersion'|'status'|'statusHistory'>>} OrganisationUpdateFragment
 */

/**
 * @typedef {{version: number, updateFragment: object}} PutByIdPayload
 */

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
    auth: {
      scope: [ROLES.serviceMaintainer]
    },
    validate: {
      payload: validateMyPayload
    }
  },

  /**
   * @param {import('#common/hapi-types.js').HapiRequest<PutByIdPayload> & {
   *    organisationsRepository: OrganisationsRepository,
   *    systemLogsRepository: SystemLogsRepository,
   *    params: { id: string }
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request

    const id = request.params.id.trim()

    if (!id) {
      throw Boom.notFound('Organisation not found')
    }

    const { version, updateFragment } = request.payload

    const { version: _v, id: _, ...sanitisedFragment } = updateFragment

    /** @type {OrganisationUpdateFragment} */
    const updates = sanitisedFragment

    try {
      const initial = await organisationsRepository.findById(id)
      await organisationsRepository.replace(id, version, updates)
      const updated = await organisationsRepository.findById(id, version + 1)
      await auditOrganisationUpdate(request, id, initial, updated)
      return h.response(updated).code(StatusCodes.OK)
    } catch (error) {
      throw Boom.boomify(error)
    }
  }
}

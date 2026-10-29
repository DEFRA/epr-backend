import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import {
  ORGANISATION_NUMBER_PATTERN,
  toOrganisationNumber
} from '#domain/organisations/numbers.js'
import { STRATEGY_NAME as BASIC_AUTH } from '#plugins/auth/basic-auth-plugin.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

const DOCUMENT_ID_PATTERN = /^[0-9a-f]{24}$/i

/**
 * The organisation a path names by its database id or its organisation
 * number. An id is tried first, since one can be all digits.
 *
 * @param {OrganisationsRepository} organisationsRepository
 * @param {string} key
 */
const findOrganisation = async (organisationsRepository, key) => {
  if (DOCUMENT_ID_PATTERN.test(key)) {
    return organisationsRepository.findById(key)
  }

  const organisation = ORGANISATION_NUMBER_PATTERN.test(key)
    ? await organisationsRepository.findByOrganisationNumber(
        toOrganisationNumber(key)
      )
    : null

  if (!organisation) {
    throw Boom.notFound('Organisation not found')
  }

  return organisation
}

export const organisationsGetByIdPath = '/v1/organisations/{organisationId}'

export const organisationsGetById = {
  method: 'GET',
  path: organisationsGetByIdPath,
  options: {
    auth: {
      strategies: ['access-token', BASIC_AUTH],
      scope: [SCOPES.organisationRead, SCOPES.adminRead]
    },
    tags: ['api', 'admin']
  },
  /**
   * @param {import('#common/hapi-types.js').HapiRequest & {
   *   organisationsRepository: OrganisationsRepository,
   *   params: { organisationId: string }
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationsRepository } = request

    const organisation = await findOrganisation(
      organisationsRepository,
      request.params.organisationId.trim()
    )

    return h.response(organisation).code(StatusCodes.OK)
  }
}

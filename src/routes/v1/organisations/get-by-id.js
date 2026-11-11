import Boom from '@hapi/boom'
import { toOrganisationWire } from '#common/helpers/organisation-wire.js'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import {
  ORGANISATION_NUMBER_PATTERN,
  toOrganisationNumber
} from '#domain/organisations/numbers.js'
import { STRATEGY_NAME as BASIC_AUTH } from '#plugins/auth/basic-auth-plugin.js'

/** @typedef {import('#repositories/organisations/administration-port.js').OrganisationAdministrationRepository} OrganisationAdministrationRepository */

const DOCUMENT_ID_PATTERN = /^[0-9a-f]{24}$/i

/**
 * The organisation a path names by its database id or its organisation
 * number. An id is tried first, since one can be all digits.
 *
 * @param {OrganisationAdministrationRepository} organisationAdministrationRepository
 * @param {string} key
 */
const findOrganisation = async (organisationAdministrationRepository, key) => {
  if (DOCUMENT_ID_PATTERN.test(key)) {
    return organisationAdministrationRepository.findById(key)
  }

  const organisation = ORGANISATION_NUMBER_PATTERN.test(key)
    ? await organisationAdministrationRepository.findByOrganisationNumber(
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
   *   organisationAdministrationRepository: OrganisationAdministrationRepository,
   *   params: { organisationId: string }
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const { organisationAdministrationRepository } = request

    const organisation = await findOrganisation(
      organisationAdministrationRepository,
      request.params.organisationId.trim()
    )

    return h.response(toOrganisationWire(organisation)).code(StatusCodes.OK)
  }
}

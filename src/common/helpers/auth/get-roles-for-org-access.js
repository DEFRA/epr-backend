import Boom from '@hapi/boom'
import { STATUS } from '#domain/organisations/model.js'
import { ROLES } from '#common/helpers/auth/constants.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

/**
 * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
 * @param {string} linkedEprOg
 * @returns {Promise<string[]>}
 */
export const getRolesForOrganisationAccess = async (request, linkedEprOg) => {
  const { organisationId } = request.params

  if (!organisationId) {
    // The user is not trying to access a an organisation resource
    return []
  }

  if (organisationId !== linkedEprOg) {
    throw Boom.forbidden('Access denied: organisation mismatch')
  }

  const organisationById =
    await request.organisationsRepository.findById(organisationId)
  const orgStatusIsAccessible = [STATUS.ACTIVE, STATUS.SUSPENDED].includes(
    organisationById.status
  )

  // Organisation has a status allowing it to be accessed
  if (!orgStatusIsAccessible) {
    throw Boom.forbidden('Access denied: organisation status not accessible')
  }

  // Placeholder for checking whether the user is part of the EPROrganisation

  return [ROLES.standardUser]
}

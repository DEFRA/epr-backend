import { ROLES } from '#common/helpers/auth/constants.js'
import { ORGANISATION_STATUS } from '#domain/organisations/model.js'
import Boom from '@hapi/boom'
import { addOrUpdateOrganisationUser } from './add-or-update-organisation-user.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('./types.js').DefraIdTokenPayload} DefraIdTokenPayload */

/**
 * Determines roles for organization access based on token and organization status
 * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request - The Hapi request object
 * @param {string} linkedEprOrgId - The linked EPR organization ID
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload
 * @returns {Promise<string[]>} Array of role strings
 */
export const getRolesForOrganisationAccess = async (
  request,
  linkedEprOrgId,
  tokenPayload
) => {
  const { organisationId } = request.params

  if (!organisationId) {
    // The user is not trying to access a an organisation resource
    return []
  }

  if (organisationId !== linkedEprOrgId) {
    throw Boom.forbidden('Access denied: organisation mismatch')
  }

  const organisationById =
    await request.organisationsRepository.findById(organisationId)
  const orgStatusIsAccessible = [ORGANISATION_STATUS.ACTIVE].includes(
    organisationById.status
  )

  // Organisation has a status allowing it to be accessed
  if (!orgStatusIsAccessible) {
    throw Boom.forbidden('Access denied: organisation status not accessible')
  }

  addOrUpdateOrganisationUser(request, tokenPayload, organisationById)

  return [ROLES.standardUser]
}

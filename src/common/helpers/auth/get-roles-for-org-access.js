import Boom from '@hapi/boom'
import { STATUS } from '#domain/organisations/model.js'
import { ROLES } from '#common/helpers/auth/constants.js'
import { addStandardUserIfNotPresent } from './add-standard-user-if-not-present.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('./types.js').DefraIdTokenPayload} DefraIdTokenPayload */

/**
 * Determines roles for organization access based on token and organization status
 * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request - The Hapi request object
 * @param {string} linkedEprOgId - The linked EPR organization ID
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload
 * @returns {Promise<string[]>} Array of role strings
 */
export const getRolesForOrganisationAccess = async (
  request,
  linkedEprOgId,
  tokenPayload
) => {
  const { organisationId } = request.params

  if (!organisationId) {
    // The user is not trying to access a an organisation resource
    return []
  }

  if (organisationId !== linkedEprOgId) {
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

  addStandardUserIfNotPresent(request, tokenPayload, organisationById)

  return [ROLES.standardUser]
}

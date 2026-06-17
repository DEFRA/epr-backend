import { ROLES } from '#common/helpers/auth/constants.js'
import { ORGANISATION_STATUS } from '#domain/organisations/model.js'
import Boom from '@hapi/boom'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('./types.js').DefraIdTokenPayload} DefraIdTokenPayload */

/**
 * Determines roles for organization access based on token and organization status
 * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request - The Hapi request object
 * @param {string} linkedEprOrgId - The linked EPR organization ID
 * @returns {Promise<string[]>} Array of role strings
 */
export const getRolesForOrganisationAccess = async (
  request,
  linkedEprOrgId
) => {
  const { organisationId } = request.params

  if (!organisationId) {
    // The user is not trying to access a an organisation resource
    return []
  }

  if (organisationId !== linkedEprOrgId) {
    throw Boom.forbidden('Access denied: organisation mismatch')
  }

  const organisation =
    await request.organisationsRepository.findById(organisationId)

  if (organisation.status !== ORGANISATION_STATUS.ACTIVE) {
    throw Boom.forbidden('Access denied: organisation status not accessible')
  }

  return [ROLES.standardUser]
}

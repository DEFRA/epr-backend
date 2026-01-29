import { ROLES } from '#common/helpers/auth/constants.js'
import { getDefraTokenSummary, isInitialUser } from './roles/helpers.js'
import { ORGANISATION_STATUS } from '#domain/organisations/model.js'
import { addOrUpdateOrganisationUser } from './add-or-update-organisation-user.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('./types.js').DefraIdTokenPayload} DefraIdTokenPayload */

/**
 * Determines the roles for a Defra ID user based on their token and request context
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload
 * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
 * @returns {Promise<string[]>} Array of role strings
 */
export async function getDefraUserRoles(tokenPayload, request) {
  const { email } = tokenPayload

  if (!email) {
    return []
  }

  const roles = [ROLES.inquirer]

  const { organisationId } = request.params

  if (!organisationId) {
    return roles
  }

  try {
    const organisationById =
      await request.organisationsRepository.findById(organisationId)
    const orgInToken = getDefraTokenSummary(tokenPayload)

    if (isInitialUser(email, organisationById)) {
      request.server.app.orgInToken = orgInToken
      roles.push(ROLES.linker)
    }

    if (
      orgIsLinkedToUsersDefraIdOrg(organisationById, orgInToken) &&
      orgStatusIsAccessible(organisationById)
    ) {
      addOrUpdateOrganisationUser(request, tokenPayload, organisationById)
      roles.push(ROLES.standardUser)
    }
  } catch (_error) {
    request.logger.info({
      message: `No organisation found for ID: ${organisationId}`
    })
  }

  return roles
}

/**
 * @param {Object} organization
 * @param {{ defraIdOrgId?: string }} orgInUsersToken
 * @returns
 */
function orgIsLinkedToUsersDefraIdOrg(
  organization,
  { defraIdOrgId: usersDefraIdOrgId }
) {
  return (
    !!usersDefraIdOrgId &&
    organization.linkedDefraOrganisation?.orgId === usersDefraIdOrgId
  )
}

/**
 * @param {Object} organization
 * @returns {boolean}
 */
function orgStatusIsAccessible(organization) {
  return [ORGANISATION_STATUS.ACTIVE].includes(organization.status)
}

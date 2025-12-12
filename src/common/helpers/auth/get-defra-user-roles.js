import Boom from '@hapi/boom'
import { ROLES } from '#common/helpers/auth/constants.js'
import { isAuthorisedOrgLinkingReq } from './is-authorised-org-linking-req.js'
import {
  isOrganisationsDiscoveryReq,
  getDefraTokenSummary
} from './roles/helpers.js'
import { getOrgMatchingUsersToken } from './get-users-org-info.js'
import { getRolesForOrganisationAccess } from './get-roles-for-org-access.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('./types.js').DefraIdTokenPayload} DefraIdTokenPayload */

/**
 * Determines the roles for a Defra ID user based on their token and request context.
 *
 * Also stores linkedOrgId on request.app for the org-access-plugin to use in onPostAuth.
 * The actual org mismatch and status checks happen there to ensure proper 403 responses.
 *
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload
 * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request - The Hapi request object
 * @returns {Promise<string[]>} Array of role strings
 */
export async function getDefraUserRoles(tokenPayload, request) {
  const { email } = tokenPayload

  if (!email) {
    return []
  }

  // This throws if the user is unauthorised
  const isValidLinkingReq = await isAuthorisedOrgLinkingReq(
    request,
    tokenPayload
  )

  if (isValidLinkingReq) {
    request.server.app.orgInToken = getDefraTokenSummary(tokenPayload)

    return [ROLES.linker]
  }

  const { organisationsRepository } = request

  // The endpoint will show info based on the user's email and contactId
  if (isOrganisationsDiscoveryReq(request)) {
    return [ROLES.inquirer]
  }

  const linkedEprOrg = await getOrgMatchingUsersToken(
    tokenPayload,
    organisationsRepository
  )

  if (!linkedEprOrg) {
    throw Boom.unauthorized('User token is not linked to an organisation')
  }

  // Store linkedOrgId for the org-access-plugin to use in onPostAuth
  request.app.linkedOrgId = linkedEprOrg.id

  // Returns [standardUser] if organisationId param exists, otherwise []
  // Actual org mismatch and status checks happen in org-access-plugin (onPostAuth)
  const roles = getRolesForOrganisationAccess(request)

  return roles
}

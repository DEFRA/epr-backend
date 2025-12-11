import Boom from '@hapi/boom'
import { ROLES } from '#common/helpers/auth/constants.js'
import { isAuthorisedOrgLinkingReq } from './is-authorised-org-linking-req.js'
import {
  isOrganisationsDiscoveryReq,
  getDefraTokenSummary
} from './roles/helpers.js'
import { getUsersOrganisationInfo } from './get-users-org-info.js'
import { getRolesForOrganisationAccess } from './get-roles-for-org-access.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('./types.js').DefraIdTokenPayload} DefraIdTokenPayload */

/** @import {Roles} from '#common/helpers/auth/constants.js' */

/**
 * Determines the roles for a Defra ID user based on their token and request context
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

  const { linkedEprOrg } = await getUsersOrganisationInfo(
    tokenPayload,
    organisationsRepository
  )

  if (!linkedEprOrg) {
    throw Boom.unauthorized('User token is not linked to an organisation')
  }

  // Throws error if:
  // - the request does not have an organisationId param
  // - or if the linkedEprOrg does not match the organisationId param
  // - or if the organisation status is not accessible
  // Adds the user to the organisation if they are not already present
  const roles = await getRolesForOrganisationAccess(
    request,
    linkedEprOrg,
    tokenPayload
  )

  return roles
}

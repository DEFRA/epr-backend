import { ROLES } from '#common/helpers/auth/constants.js'
import { isAuthorisedOrgLinkingReq } from './is-authorised-org-linking-req.js'
import { isOrganisationsDiscoveryReq } from './roles/helpers.js'
import { getUsersOrganisationInfo } from './get-users-org-info.js'
import { getRolesForOrganisationAccess } from './get-roles-for-org-access.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

/** @import {Roles} from '#common/helpers/auth/constants.js' */

/**
 * @typedef {{
 *  email: string;
 * }} TokenPayload
 */

/**
 * @param {TokenPayload} tokenPayload
 * @returns {Promise<Roles[]>}
 */

/**
 * @param {TokenPayload} tokenPayload
 * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
 * @returns {Promise<Roles[]>}
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

  // Throws error if:
  // - the request does not have an organisationId param
  // - or if the linkedEprOrg does not match the organisationId param
  // - or if the organisation status is not accessible
  const roles = await getRolesForOrganisationAccess(request, linkedEprOrg)

  return roles
}

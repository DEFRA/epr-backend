import { ROLES } from '#common/helpers/auth/constants.js'
import { isAuthorisedOrgLinkingReq } from './is-authorised-org-linking-req.js'
import { isOrganisationsDiscoveryReq } from './roles/helpers.js'
import { getUsersOrganisationInfo } from './get-users-org-info.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */

/**
 * @param {Object} tokenPayload
 * @param {string} tokenPayload.id
 * @param {string} tokenPayload.email
 * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
 * @returns {Promise<string[]>}
 */
export async function getDefraUserRoles(tokenPayload, request) {
  const { id, email } = tokenPayload

  if (!id || !email) {
    return []
  }

  const isValidLinkingReq = await isAuthorisedOrgLinkingReq(
    request,
    tokenPayload
  )
  if (isValidLinkingReq) {
    return []
  }

  const { organisationsRepository } = request

  // TODO: Prevent this from throwin an error if user isn't linked yet
  const { linkedEprOrg, userOrgs } = getUsersOrganisationInfo(
    tokenPayload,
    organisationsRepository
  )

  if (isOrganisationsDiscoveryReq(request)) {
    // The route is responsible for determining what info the user can see
    return [ROLES.linker]
  }

  // Throws an error if:
  // - the request does not have an organisationId param
  // - or if the linkedEprOrg does not match the organisationId param
  validateEprOrganisationAccess(request, linkedEprOrg)

  return [ROLES.standardUser]
}

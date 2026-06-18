import { ROLES } from '#common/helpers/auth/constants.js'
import { ORGANISATION_STATUS } from '#domain/organisations/model.js'
import { isAuthorisedOrgLinkingReq } from './is-authorised-org-linking-req.js'
import { getDefraTokenSummary } from './roles/helpers.js'
import { getOrgMatchingUsersToken } from './get-users-org-info.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('./types.js').DefraIdTokenPayload} DefraIdTokenPayload */

/**
 * Determines the roles for a Defra ID user based on their token and request context
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload
 * @param {import('#common/hapi-types.js').HapiRequest} request - The Hapi request object
 * @returns {Promise<import('#auth/types.js').UserRoleAndScopes>}
 */
export async function getDefraUserRoles(tokenPayload, request) {
  const { email } = tokenPayload

  if (!email) {
    return { role: null, scopes: [] }
  }

  // This throws if the user is unauthorised
  const isValidLinkingReq = await isAuthorisedOrgLinkingReq(
    request,
    tokenPayload
  )

  if (isValidLinkingReq) {
    request.server.app.orgInToken = getDefraTokenSummary(tokenPayload)

    return { role: null, scopes: [ROLES.linker] } // this highlights how this code has mixed up roles/scopes - needs fixing!
  }

  const { organisationsRepository } = request

  const linkedEprOrg = await getOrgMatchingUsersToken(
    tokenPayload,
    organisationsRepository
  )

  const roles =
    linkedEprOrg &&
    requestIsForSameOrganisation(request, linkedEprOrg) &&
    organisationIsActive(linkedEprOrg)
      ? [ROLES.inquirer, ROLES.standardUser]
      : [ROLES.inquirer]

  return { role: null, scopes: roles } // this highlights how this code has mixed up roles/scopes - needs fixing!
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest} request
 * @param {import('#domain/organisations/model.js').Organisation} linkedEprOrg
 */
const requestIsForSameOrganisation = (request, linkedEprOrg) => {
  const { organisationId } = request.params

  return !!organisationId && organisationId === linkedEprOrg.id
}

/**
 * @param {import('#domain/organisations/model.js').Organisation} organisation
 */
const organisationIsActive = (organisation) => {
  return organisation.status === ORGANISATION_STATUS.ACTIVE
}

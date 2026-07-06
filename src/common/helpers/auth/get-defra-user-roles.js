import { ROLES, SCOPES } from '#common/helpers/auth/constants.js'
import { ORGANISATION_STATUS } from '#domain/organisations/model.js'
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

  const { organisationsRepository } = request

  const linkedEprOrg = await getOrgMatchingUsersToken(
    tokenPayload,
    organisationsRepository
  )

  const isStandardUserForThisOrg =
    linkedEprOrg &&
    requestIsForSameOrganisation(request, linkedEprOrg) &&
    organisationIsActive(linkedEprOrg)

  const scopes = [
    SCOPES.organisationLinkedRead,
    SCOPES.organisationLinkedWrite,
    ...(isStandardUserForThisOrg ? [ROLES.standardUser] : []) // this highlights how this code (still) has mixed up roles/scopes - needs fixing!
  ]

  return { role: null, scopes }
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

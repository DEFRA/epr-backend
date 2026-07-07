import { SCOPES } from '#common/helpers/auth/constants.js'
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

  const usersLinkedOrg = await getOrgMatchingUsersToken(
    tokenPayload,
    organisationsRepository
  )

  const isRequestForUsersLinkedOrg =
    usersLinkedOrg && requestIsForSameOrganisation(request, usersLinkedOrg)

  const scopes = [
    SCOPES.organisationLinkedRead,
    SCOPES.organisationLinkedWrite,
    ...(isRequestForUsersLinkedOrg && organisationIsActive(usersLinkedOrg)
      ? [SCOPES.organisationRead, SCOPES.organisationWrite]
      : [])
  ]

  return { role: null, scopes }
}

/**
 * @param {import('#common/hapi-types.js').HapiRequest} request
 * @param {import('#domain/organisations/model.js').Organisation} usersLinkedOrg
 */
const requestIsForSameOrganisation = (request, usersLinkedOrg) => {
  const { organisationId } = request.params

  return !!organisationId && organisationId === usersLinkedOrg.id
}

/**
 * @param {import('#domain/organisations/model.js').Organisation} organisation
 */
const organisationIsActive = (organisation) => {
  return organisation.status === ORGANISATION_STATUS.ACTIVE
}

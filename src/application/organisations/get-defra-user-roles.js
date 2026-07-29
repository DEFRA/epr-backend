import { SCOPES } from '#common/helpers/auth/constants.js'
import { ORGANISATION_STATUS } from '#domain/organisations/model.js'
import { getOrgMatchingUsersToken } from './get-users-org-info.js'

/** @import {DefraIdTokenPayload, UserRoleAndScopes} from '#auth/types.js' */
/** @import {HapiRequest} from '#common/hapi-types.js' */
/** @import {Organisation} from '#domain/organisations/model.js' */

/**
 * Determines the roles for a Defra ID user based on their token and request context
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload
 * @param {HapiRequest} request - The Hapi request object
 * @returns {Promise<UserRoleAndScopes>}
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
 * @param {HapiRequest} request
 * @param {Organisation} usersLinkedOrg
 */
const requestIsForSameOrganisation = (request, usersLinkedOrg) => {
  const { organisationId } = request.params

  return !!organisationId && organisationId === usersLinkedOrg.id
}

/**
 * @param {Organisation} organisation
 */
const organisationIsActive = (organisation) => {
  return organisation.status === ORGANISATION_STATUS.ACTIVE
}

import Boom from '@hapi/boom'
import { ROLES } from '#common/helpers/auth/constants.js'
import { isAuthorisedOrgLinkingReq } from './is-authorised-org-linking-req.js'
import {
  getDefraTokenSummary,
  isOrganisationsDiscoveryReq
} from './roles/helpers.js'
import { getOrgMatchingUsersToken } from './get-users-org-info.js'
import { getRolesForOrganisationAccess } from './get-roles-for-org-access.js'
import { ORGANISATION_STATUS } from '#domain/organisations/model.js'

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('./types.js').DefraIdTokenPayload} DefraIdTokenPayload */

/**
 * Determines the roles for a Defra ID user based on their token and request context
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload
 * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
 * @returns {Promise<string[]>} Array of role strings
 */
export async function getDefraUserRoles(tokenPayload, request) {
  if (request.route.settings.app.usesRefactoredDefraIdAuth) {
    return rolesGivenDefraIdToken(tokenPayload, request)
  }

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
    throw Boom.forbidden('User is not linked to an organisation')
  }

  // Throws error if:
  // - the request does not have an organisationId param
  // - or if the linkedEprOrg does not match the organisationId param
  // - or if the organisation status is not accessible
  // Adds the user to the organisation if they are not already present
  const roles = await getRolesForOrganisationAccess(
    request,
    linkedEprOrg.id,
    tokenPayload
  )

  return roles
}

/**
 * Determines the roles for a Defra ID user based on their token and request context
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload
 * @param {import('#common/hapi-types.js').HapiRequest & {organisationsRepository: OrganisationsRepository}} request
 * @returns {Promise<string[]>} Array of role strings
 */
async function rolesGivenDefraIdToken(tokenPayload, request) {
  const roles = []

  const orgInToken = getDefraTokenSummary(tokenPayload)

  const { organisationId, accreditationId } = request.params

  const organisation = await loadOrganisation(
    request.organisationsRepository,
    organisationId
  )

  if (
    organisation &&
    orgIsLinkedToUsersDefraIdOrg(organisation, orgInToken) &&
    orgStatusIsAccessible(organisation) &&
    orgOwnsAccreditation(organisation, accreditationId)
  ) {
    // TODO call addOrUpdateOrganisationUser here?
    roles.push(ROLES.standardUser)
  }

  return roles
}

async function loadOrganisation(organisationsRepository, organisationId) {
  try {
    return await organisationsRepository.findById(organisationId)
  } catch (_error) {
    // repository behaviour is to throw if not found
    return null
  }
}

/**
 * @param {Object} organisation
 * @param {{ defraIdOrgId?: string }} orgInUsersToken
 * @returns
 */
function orgIsLinkedToUsersDefraIdOrg(
  organisation,
  { defraIdOrgId: usersDefraIdOrgId }
) {
  return !!usersDefraIdOrgId && organisation.linkedDefraOrganisation?.orgId === usersDefraIdOrgId
}

/**
 * @param {Object} organisation
 * @returns {boolean}
 */
function orgStatusIsAccessible(organisation) {
  return [ORGANISATION_STATUS.ACTIVE].includes(organisation.status)
}

/**
 * @param {Object} organisation
 * @param {string} accreditatonId
 * @returns {boolean}
 */
function orgOwnsAccreditation(
  organisation,
  accreditatonId
) {
  return organisation.accreditations.some(
    (accreditation) => accreditation.id === accreditatonId
  )
}

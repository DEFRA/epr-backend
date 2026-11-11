import { getDefraTokenSummary } from '#common/helpers/auth/roles/helpers.js'

/**
 * @typedef {'trace'|'debug'|'info'|'warn'|'error'|'fatal'} LogLevel
 */

/** @import { OrganisationLinkingRepository } from '#repositories/organisations/linking-port.js' */
/** @import {DefraIdTokenPayload} from '#auth/types.js' */
/** @import {LinkedOrganisationSummary} from '#repositories/organisations/linking-port.js' */

/**
 * Retrieves organization information for a user based on their Defra ID token
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload containing user and organization data
 * @param {OrganisationLinkingRepository} organisationLinkingRepository
 * @returns {Promise<LinkedOrganisationSummary | null>} The first matching organisation or null if no match or no org ID in token
 */
export async function getOrgMatchingUsersToken(
  tokenPayload,
  organisationLinkingRepository
) {
  const { defraIdOrgId } = getDefraTokenSummary(tokenPayload)

  /* istanbul ignore if -- defensive: defraIdOrgId always present in valid tokens */
  if (!defraIdOrgId) {
    return null
  }

  return organisationLinkingRepository.findByLinkedDefraOrgId(defraIdOrgId)
}

import {
  findOrganisationMatches,
  getDefraTokenSummary
} from '#common/helpers/auth/roles/helpers.js'

/**
 * @typedef {'trace'|'debug'|'info'|'warn'|'error'|'fatal'} LogLevel
 */

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('./types.js').DefraIdTokenPayload} DefraIdTokenPayload */

/** @import {Organisation} from '#domain/organisations/model.js' */

/**
 * Retrieves organization information for a user based on their Defra ID token
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload containing user and organization data
 * @param {OrganisationsRepository} organisationsRepository - The organisations repository
 * @returns {Promise<Organisation | null>} The first matching organisation or null if no match or no org ID in token
 */
export async function getOrgMatchingUsersToken(
  tokenPayload,
  organisationsRepository
) {
  const { defraIdOrgId } = getDefraTokenSummary(tokenPayload)

  /* istanbul ignore if -- defensive: defraIdOrgId always present in valid tokens */
  if (!defraIdOrgId) {
    return null
  }

  return findOrganisationMatches(defraIdOrgId, organisationsRepository)
}

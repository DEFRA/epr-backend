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
 * @returns {Promise<Organisation>} The first matching organisation
 */
export async function getOrgMatchingUsersToken(
  tokenPayload,
  organisationsRepository
) {
  const { defraIdOrgId } = getDefraTokenSummary(tokenPayload)

  const linkedEprOrg = await findOrganisationMatches(
    defraIdOrgId,
    organisationsRepository
  )

  return linkedEprOrg
}

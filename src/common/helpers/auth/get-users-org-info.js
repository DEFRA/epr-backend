import Boom from '@hapi/boom'
import {
  findOrganisationMatches,
  getDefraTokenSummary
} from '#common/helpers/auth/roles/helpers.js'

/**
 * @typedef {'trace'|'debug'|'info'|'warn'|'error'|'fatal'} LogLevel
 */

/** @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository */
/** @typedef {import('./types.js').DefraIdTokenPayload} DefraIdTokenPayload */

/**
 * Retrieves organization information for a user based on their Defra ID token
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload containing user and organization data
 * @param {OrganisationsRepository} organisationsRepository - The organisations repository
 * @returns {Promise<{linkedEprOrg: string, userOrgs: Array}>} Object containing linked EPR org and all user orgs
 */
export async function getUsersOrganisationInfo(
  tokenPayload,
  organisationsRepository
) {
  const { email } = tokenPayload

  const { defraIdOrgId } = getDefraTokenSummary(tokenPayload)

  const organisationsInfo = await findOrganisationMatches(
    email,
    defraIdOrgId,
    organisationsRepository
  )

  if (organisationsInfo.linked.length > 1) {
    // Impossible to unequivocally determine which organisation is current
    throw Boom.forbidden(
      'defra-id: multiple organisations linked to the user token'
    )
  }

  const linkedEprOrg = organisationsInfo.linked[0]
  const userOrgs = organisationsInfo.all

  return { linkedEprOrg, userOrgs }
}

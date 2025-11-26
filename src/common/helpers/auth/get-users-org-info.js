import Boom from '@hapi/boom'
import {
  findOrganisationMatches,
  getDefraTokenSummary
} from '#common/helpers/auth/roles/helpers.js'

/**
 * @typedef {'trace'|'debug'|'info'|'warn'|'error'|'fatal'} LogLevel
 */

/**
 * @param {object} tokenPayload - The OIDC token payload containing user and organization data
 */
export async function getUsersOrganisationInfo(
  tokenPayload,
  organisationsRepository
) {
  const { email } = tokenPayload

  const { defraIdOrgId } = getDefraTokenSummary(tokenPayload)

  // No defraIdOrgId to link
  if (!defraIdOrgId) {
    throw Boom.forbidden('defra-id: defraIdOrgId not found in token')
  }

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

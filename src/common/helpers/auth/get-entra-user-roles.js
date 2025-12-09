import { ROLES } from '#common/helpers/auth/constants.js'
import { getConfig } from '#root/config.js'

/** @typedef {import('./types.js').EntraIdTokenPayload} EntraIdTokenPayload */

/**
 * Determines the roles for an Entra ID user based on their token
 * @param {string} userEmail - The user's email address (taken from Entra ID access token)
 * @returns {Promise<string[]>} Array of role strings
 */
export async function getEntraUserRoles(userEmail) {

  const stringifiedServiceMaintainersList = getConfig().get(
    'roles.serviceMaintainers'
  )

  const thisUserRoles = []
  // This should never thrown an error as the config is validated when the server is started
  const serviceMaintainersList = JSON.parse(stringifiedServiceMaintainersList)

  if (
    serviceMaintainersList.some(
      (email) => email.toLowerCase() === userEmail?.toLowerCase()
    )
  ) {
    thisUserRoles.push(ROLES.serviceMaintainer)
  }

  return thisUserRoles
}

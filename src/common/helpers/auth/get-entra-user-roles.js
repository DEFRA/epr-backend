import { ADMIN_ROLES } from '#common/helpers/auth/constants.js'
import { getConfig } from '#root/config.js'

/**
 * Email lists are evaluated in this order; first match wins.
 * A user appearing in multiple lists silently takes the highest tier.
 */
const ADMIN_ROLE_RESOLUTION_ORDER = [
  ['service_maintainer_write', 'roles.serviceMaintainersWrite'],
  ['service_maintainer', 'roles.serviceMaintainers'],
  ['support', 'roles.support']
]

/**
 * Resolves an Entra ID user's admin role and bundled scopes from
 * email-list config. Email comparison is case-insensitive.
 * @param {string | undefined | null} userEmail - Email from the validated Entra access token.
 * @returns {Promise<import('#auth/types.js').UserRoleAndScopes>}
 */
export async function getEntraUserRoles(userEmail) {
  if (!userEmail) {
    return { role: null, scopes: [] }
  }

  const config = getConfig()
  const lowerEmail = userEmail.toLowerCase()

  for (const [role, configKey] of ADMIN_ROLE_RESOLUTION_ORDER) {
    const list = JSON.parse(config.get(configKey))
    if (list.some((email) => email.toLowerCase() === lowerEmail)) {
      return { role, scopes: [...ADMIN_ROLES[role]] }
    }
  }

  return { role: null, scopes: [] }
}

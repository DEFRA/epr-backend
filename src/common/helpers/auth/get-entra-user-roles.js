import {
  ADMIN_ROLES,
  REGULATOR_APP_ROLE,
  REGULATOR_ROLE,
  REGULATOR_SCOPES
} from '#common/helpers/auth/constants.js'
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
 * Resolves an Entra ID user's role and bundled scopes.
 *
 * The regulator application role and the admin email lists are independent
 * rules. An identity matching both receives the union of the two bundles.
 * Neither rule short-circuits the other: a first-match rule would let an
 * Entra role assignment silently remove a service maintainer's admin access,
 * with no repository change and no signal but a 403.
 *
 * The role is the audit label and stays a single value. Where both rules
 * match, the admin tier keeps it, so a regulator assignment only ever adds.
 * @param {string | undefined | null} userEmail - Email from the validated Entra access token.
 * @param {string[]} [appRoles] - App roles from the token's `roles` claim.
 * @returns {Promise<import('#auth/types.js').UserRoleAndScopes>}
 */
export async function getEntraUserRoles(userEmail, appRoles = []) {
  const isRegulator = appRoles.includes(REGULATOR_APP_ROLE)
  const adminRole = resolveAdminRole(userEmail)

  const scopes = new Set([
    ...(isRegulator ? REGULATOR_SCOPES : []),
    ...(adminRole ? ADMIN_ROLES[adminRole] : [])
  ])

  return {
    role: adminRole ?? (isRegulator ? REGULATOR_ROLE : null),
    scopes: [...scopes]
  }
}

/**
 * Resolves an admin tier from the email-list config. Email comparison is
 * case-insensitive, and a user on more than one list takes the highest tier.
 * @param {string | undefined | null} userEmail
 * @returns {string | null}
 */
function resolveAdminRole(userEmail) {
  if (!userEmail) {
    return null
  }

  const config = getConfig()
  const lowerEmail = userEmail.toLowerCase()

  for (const [role, configKey] of ADMIN_ROLE_RESOLUTION_ORDER) {
    const list = JSON.parse(config.get(configKey))
    if (list.some((email) => email.toLowerCase() === lowerEmail)) {
      return role
    }
  }

  return null
}

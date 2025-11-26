import { ROLES } from '#common/helpers/auth/constants.js'

/**
 * @param {Object} tokenPayload
 * @param {string} tokenPayload.id
 * @param {string} tokenPayload.email
 * @returns {Promise<string[]>}
 */
export async function getDefraUserRoles(tokenPayload) {
  const { id, email } = tokenPayload

  if (!id || !email) {
    return []
  }

  return [ROLES.standardUser]
}

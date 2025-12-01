import { ROLES } from '#common/helpers/auth/constants.js'

/** @import {Roles} from '#common/helpers/auth/constants.js' */

/**
 * @typedef {{
 *  contactId: string;
 *  email: string;
 * }} TokenPayload
 */

/**
 * @param {TokenPayload} tokenPayload
 * @returns {Promise<Roles[]>}
 */
export async function getDefraUserRoles(tokenPayload) {
  const { contactId, email } = tokenPayload

  console.log('contactId, email :>> ', contactId, email)
  if (!contactId || !email) {
    return []
  }

  return [ROLES.standardUser]
}

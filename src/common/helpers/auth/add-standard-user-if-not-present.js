import { ROLES } from '#common/helpers/auth/constants.js'
import { findUserInOrg } from '#common/helpers/auth/roles/helpers.js'

/** @typedef {import('./types.js').DefraIdTokenPayload} DefraIdTokenPayload */

/**
 * Adds a user to an organisation if they are not there
 * @param {Object} request - The Hapi request object
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload containing user information
 * @param {Object} organisationById - The organisation object
 * @returns {Promise<void>}
 */
export const addStandardUserIfNotPresent = async (
  request,
  tokenPayload,
  organisationById
) => {
  const { organisationsRepository } = request
  const { email, firstName, lastName, contactId } = tokenPayload

  const user = findUserInOrg(organisationById, email, contactId)

  if (!user) {
    await organisationsRepository.update(
      organisationById.id,
      organisationById.version,
      {
        users: [
          ...organisationById.users,
          {
            email,
            fullName: `${firstName} ${lastName}`,
            isInitialUser: false,
            roles: [ROLES.standardUser]
          }
        ]
      }
    )
  }
}

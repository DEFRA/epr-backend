import { ROLES } from '#common/helpers/auth/constants.js'
import { findUserInOrg } from '#common/helpers/auth/roles/helpers.js'

/** @import {DefraIdTokenPayload} from './types.js' */
/** @import {HapiRequest} from '#common/hapi-types.js' */
/** @import {Organisation} from '#domain/organisations/model.js' */

/**
 * Adds a user to an organisation if they are not there
 * @param {HapiRequest} request - The Hapi request object
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload containing user information
 * @param {Organisation} organisationById - The organisation object
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
          ...(organisationById.users || []),
          {
            contactId,
            email,
            fullName: `${firstName} ${lastName}`,
            roles: [ROLES.standardUser]
          }
        ]
      }
    )
  }
}

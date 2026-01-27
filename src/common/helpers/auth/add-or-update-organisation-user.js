import { stringEquals } from '#common/helpers/auth/roles/helpers.js'
import { USER_ROLES } from '#domain/organisations/model.js'
import partition from 'lodash.partition'

/** @import {CollatedUser, Organisation} from '#domain/organisations/model.js' */
/** @import {DefraIdTokenPayload} from './types.js' */
/** @import {HapiRequest} from '#common/hapi-types.js' */

export const getDisplayName = ({ firstName, lastName }) =>
  [firstName, lastName].filter(Boolean).join(' ')

/** @param {CollatedUser | null} user */
const noUser = (user) => !user

/** @param {CollatedUser | null} user */
const withChangedDetails = (
  user,
  /** @type {DefraIdTokenPayload} */ { email, firstName, lastName }
) =>
  user &&
  (!stringEquals(user.email, email) ||
    !stringEquals(user.fullName, getDisplayName({ firstName, lastName })))

/**
 * @param {Organisation} organisation
 * @param {DefraIdTokenPayload} token
 * @returns {{ user: CollatedUser|null, otherUsers: CollatedUser[] }}
 */
const extractUserAndOthers = (organisation, { email, contactId }) => {
  const [matchingUsers, otherUsers] = partition(
    organisation.users ?? [],
    /**
     * @param {CollatedUser} user
     * @returns {boolean}
     */
    (user) => stringEquals(user.email, email) || user.contactId === contactId
  )

  return {
    user: matchingUsers[0] ?? null,
    otherUsers
  }
}

/**
 * Adds a user to an organisation if they are not there
 * @param {HapiRequest} request - The Hapi request object
 * @param {DefraIdTokenPayload} tokenPayload - The Defra ID token payload containing user information
 * @param {Organisation} organisationById - The organisation object
 * @returns {Promise<void>}
 */
export const addOrUpdateOrganisationUser = async (
  request,
  tokenPayload,
  organisationById
) => {
  const { organisationsRepository } = request
  const { email, firstName, lastName, contactId } = tokenPayload

  const { user, otherUsers } = extractUserAndOthers(
    organisationById,
    tokenPayload
  )

  /* v8 ignore next */
  if (noUser(user) || withChangedDetails(user, tokenPayload)) {
    const { id: _, version: _v, ...org } = organisationById

    await organisationsRepository.replace(
      organisationById.id,
      organisationById.version,
      {
        ...org,
        users: [
          {
            contactId,
            email,
            fullName: getDisplayName({ firstName, lastName }),
            roles: user?.roles ?? [USER_ROLES.STANDARD]
          },
          ...otherUsers
        ]
      }
    )
  }
}

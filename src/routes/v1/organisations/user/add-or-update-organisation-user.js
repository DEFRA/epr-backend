import { stringEquals } from '#auth/roles/helpers.js'
import { USER_ROLES } from '#domain/organisations/model.js'
import partition from 'lodash.partition'

/** @import {CollatedUser, Organisation} from '#domain/organisations/model.js' */
/** @import {DefraIdTokenPayload} from '#auth/types.js' */
/** @import {HapiRequest} from '#common/hapi-types.js' */

export const ORGANISATION_USER_RESULTS = Object.freeze(
  /** @type {const} */ ({
    NO_CHANGE: 'no-change',
    USER_ADDED: 'user-added',
    USER_UPDATED: 'user-updated'
  })
)

/** @typedef {(typeof ORGANISATION_USER_RESULTS)[keyof typeof ORGANISATION_USER_RESULTS]} OrganisationUserModification */

/** @typedef {{outcome: OrganisationUserModification, userBefore: CollatedUser | null, userAfter: CollatedUser}} OrganisationUserResult */

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
 * @param {Organisation} organisation - The organisation object
 * @returns {Promise<OrganisationUserResult>} - Result indicating if a user was added, updated, or no change
 */
export const addOrUpdateOrganisationUser = async (
  request,
  tokenPayload,
  organisation
) => {
  const { organisationsRepository } = request
  const { email, firstName, lastName, contactId } = tokenPayload

  const { user, otherUsers } = extractUserAndOthers(organisation, tokenPayload)

  /* v8 ignore next */
  if (noUser(user) || withChangedDetails(user, tokenPayload)) {
    const newUser = {
      contactId,
      email,
      fullName: getDisplayName({ firstName, lastName }),
      roles: user?.roles ?? [USER_ROLES.STANDARD]
    }
    const { id: _, version: _v, ...org } = organisation

    await organisationsRepository.replace(
      organisation.id,
      organisation.version,
      {
        ...org,
        users: [newUser, ...otherUsers]
      }
    )
    return {
      outcome: noUser(user)
        ? ORGANISATION_USER_RESULTS.USER_ADDED
        : ORGANISATION_USER_RESULTS.USER_UPDATED,
      userBefore: user,
      userAfter: newUser
    }
  }
  return {
    outcome: ORGANISATION_USER_RESULTS.NO_CHANGE,
    userBefore: user,
    userAfter: user
  }
}

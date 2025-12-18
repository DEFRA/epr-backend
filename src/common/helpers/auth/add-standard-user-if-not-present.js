import {
  findUserInOrg,
  stringEquals
} from '#common/helpers/auth/roles/helpers.js'
import { USER_ROLES } from '#domain/organisations/model.js'
import partition from 'lodash.partition'

/** @import {DefraIdTokenPayload} from './types.js' */
/** @import {HapiRequest} from '#common/hapi-types.js' */
/** @import {CollatedUser, Organisation} from '#domain/organisations/model.js' */

export const getDisplayName = ({ firstName, lastName }) =>
  [firstName, lastName].filter(Boolean).join(' ')

/** @param {CollatedUser} user */
const noUser = (user) => !user

/** @param {CollatedUser} user */
const withChangedDetails = (
  user,
  /** @type {DefraIdTokenPayload} */ { email, firstName, lastName }
) =>
  !stringEquals(user.email, email) ||
  !stringEquals(user.fullName, getDisplayName({ firstName, lastName }))

/**
 * @param {Organisation} org
 * @returns {CollatedUser[]}
 */
const getUsers = (org) => org.users ?? []

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

  const [matchingUsers, nonMatchingUsers] = partition(
    getUsers(organisationById),
    /** @type {CollatedUser} */ (user) =>
      stringEquals(user.email, email) || user.contactId === contactId
  )

  console.log('matchingUsers :>> ', matchingUsers)
  console.log('nonMatchingUsers :>> ', nonMatchingUsers)

  /* v8 ignore next */
  if (noUser(user) || withChangedDetails(user, tokenPayload)) {
    const { id: _, version: _v, ...org } = organisationById

    const newOrUpdated = {
      contactId,
      email,
      fullName: getDisplayName({ firstName, lastName }),
      roles: user?.roles ?? [USER_ROLES.STANDARD]
    }

    console.log('newOrUpdated :>> ', newOrUpdated)

    await organisationsRepository.replace(
      organisationById.id,
      organisationById.version,
      {
        ...org,
        users: [newOrUpdated, ...nonMatchingUsers]
      }
    )
  }
}

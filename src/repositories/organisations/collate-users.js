import { REGISTRATION_STATUS, USER_ROLES } from '#domain/organisations/model.js'
import { getCurrentStatus } from './status.js'

/** @import {Accreditation, AccreditationBase} from '#domain/organisations/accreditation.js' */
/** @import {CollatedUser, RegOrAccStatus, StatusHistoryItem, User, UserRoles} from '#domain/organisations/model.js' */
/** @import {Registration, RegistrationBase} from '#domain/organisations/registration.js' */

/** @typedef {Pick<CollatedUser, 'fullName'|'email'|'roles'>} SlimUser */

/**
 * The organisation as the write path holds it: statusHistory rather than a
 * materialised status, on the organisation and on every item.
 *
 * @typedef {{
 *   accreditations: AccreditationBase[],
 *   registrations: RegistrationBase[],
 *   statusHistory: StatusHistoryItem[],
 *   submitterContactDetails?: User,
 *   users?: CollatedUser[]
 * }} UserCollationSource
 */

/**
 * get user roles for the provided status. Generic over registrations and
 * accreditations; the compared values (created/approved) are common to both,
 * so the registration constants are used.
 *
 * @param {RegOrAccStatus} status
 * @returns {UserRoles[]}
 */
const getUserRolesForStatus = (status) => {
  if (
    status === REGISTRATION_STATUS.CREATED ||
    status === REGISTRATION_STATUS.APPROVED
  ) {
    return [USER_ROLES.INITIAL, USER_ROLES.STANDARD]
  }
  return [USER_ROLES.STANDARD]
}

/**
 * @template {Accreditation|Registration} T
 * @param {UserCollationSource} updated
 * @param {'accreditations'|'registrations'} collectionKey
 * @param {(item: T) => SlimUser[]} extractAdditionalUsers
 * @returns {SlimUser[]}
 */
const collateItems = (updated, collectionKey, extractAdditionalUsers) => {
  /** @type {SlimUser[]} */
  const users = []

  for (const item of updated[collectionKey]) {
    const itemStatus = getCurrentStatus(item)

    if (itemStatus === REGISTRATION_STATUS.APPROVED) {
      users.push(
        {
          fullName: item.submitterContactDetails.fullName,
          email: item.submitterContactDetails.email,
          roles: getUserRolesForStatus(itemStatus)
        },
        // collectionKey pins the element type at each call site; bridge the
        // key-to-element relationship the signature cannot express.
        ...extractAdditionalUsers(/** @type {T} */ (item))
      )
    }
  }

  return users
}

/**
 * @param {UserCollationSource} updated
 * @returns {SlimUser[]}
 */
const collateRegistrationUsers = (updated) =>
  collateItems(
    updated,
    'registrations',
    (/** @type {Registration} */ registration) => {
      const roles = getUserRolesForStatus(getCurrentStatus(registration))

      const additional = registration.approvedPersons.map(
        ({ email, fullName }) => ({ fullName, email, roles })
      )

      if (registration.applicationContactDetails) {
        const { email, fullName } = registration.applicationContactDetails
        additional.push({ fullName, email, roles })
      }

      return additional
    }
  )

/**
 * @param {UserCollationSource} updated
 * @returns {SlimUser[]}
 */
const collateAccreditationUsers = (updated) =>
  collateItems(
    updated,
    'accreditations',
    (/** @type {Accreditation} */ accreditation) =>
      accreditation.prnIssuance.signatories.map(({ email, fullName }) => ({
        fullName,
        email,
        roles: getUserRolesForStatus(getCurrentStatus(accreditation))
      }))
  )

/**
 * Deduplicates users by contact-id / email address
 *
 * @param {CollatedUser[]} users
 * @returns {CollatedUser[]}
 */
const deduplicateUsers = (users) => {
  const seenEmails = new Set()
  const seenContactIds = new Set()

  const result = []

  for (const user of users) {
    const emailKey = user.email.toLowerCase()
    const contactKey = user.contactId

    const emailSeen = seenEmails.has(emailKey)
    const contactSeen = contactKey && seenContactIds.has(contactKey)

    // skip if either key was already seen
    if (emailSeen || contactSeen) {
      continue
    }

    // keep first occurrence
    result.push(user)
    seenEmails.add(emailKey)

    if (contactKey !== undefined) {
      seenContactIds.add(contactKey)
    }
  }

  return result
}

/**
 * @param {UserCollationSource} updated
 * @returns {CollatedUser[]}
 */
export const collateUsers = (updated) => {
  /** @type {SlimUser[]} */
  const root = []

  if (updated.submitterContactDetails) {
    root.push({
      fullName: updated.submitterContactDetails.fullName,
      email: updated.submitterContactDetails.email,
      roles: getUserRolesForStatus(getCurrentStatus(updated))
    })
  }

  const users = [
    ...(updated.users ?? []),
    ...root,
    ...collateRegistrationUsers(updated),
    ...collateAccreditationUsers(updated)
  ]

  return deduplicateUsers(users)
}

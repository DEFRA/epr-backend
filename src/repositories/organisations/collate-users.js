import { REG_ACC_STATUS, USER_ROLES } from '#domain/organisations/model.js'
import { getCurrentStatus } from './status.js'

/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {CollatedUser, Organisation, RegAccStatus, UserRoles} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */

/** @typedef {Pick<CollatedUser, 'fullName'|'email'|'roles'>} SlimUser */

/**
 * get user roles for the provided status
 *
 * @param {RegAccStatus} status
 * @returns {UserRoles[]}
 */
const getUserRolesForStatus = (status) => {
  if (status === REG_ACC_STATUS.CREATED || status === REG_ACC_STATUS.APPROVED) {
    return [USER_ROLES.INITIAL, USER_ROLES.STANDARD]
  }
  return [USER_ROLES.STANDARD]
}

/**
 * @param {Organisation} updated
 * @param {'accreditations'|'registrations'} collectionKey
 * @param {(item: Accreditation|Registration) => SlimUser[]} extractAdditionalUsers
 * @returns {SlimUser[]}
 */
const collateItems = (updated, collectionKey, extractAdditionalUsers) => {
  /** @type {SlimUser[]} */
  const users = []

  for (const item of updated[collectionKey]) {
    const itemStatus = getCurrentStatus(item)

    if (itemStatus === REG_ACC_STATUS.APPROVED) {
      users.push(
        {
          fullName: item.submitterContactDetails.fullName,
          email: item.submitterContactDetails.email,
          roles: getUserRolesForStatus(itemStatus)
        },
        ...extractAdditionalUsers(item)
      )
    }
  }

  return users
}

/**
 * @param {Organisation} updated
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
 * @param {Organisation} updated
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
 * @param {Organisation} updated
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

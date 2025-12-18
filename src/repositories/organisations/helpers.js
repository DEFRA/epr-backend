import { STATUS, USER_ROLES } from '#domain/organisations/model.js'
import { validateStatusHistory } from './schema/index.js'

/** @import {CollatedUser, Organisation, Status, UserRoles} from '#domain/organisations/model.js' */
/** @import {Accreditation, Registration} from './port.js' */

export const SCHEMA_VERSION = 1

export const createStatusHistoryEntry = (status) => ({
  status,
  updatedAt: new Date()
})

export const createInitialStatusHistory = () => {
  const statusHistory = [createStatusHistoryEntry('created')]
  return validateStatusHistory(statusHistory)
}

export const getCurrentStatus = (existingItem) => {
  return existingItem.statusHistory.at(-1).status
}

export const statusHistoryWithChanges = (updatedItem, existingItem) => {
  let statusHistory = createInitialStatusHistory()
  if (existingItem) {
    if (
      updatedItem.status &&
      updatedItem.status !== getCurrentStatus(existingItem)
    ) {
      statusHistory = [
        ...existingItem.statusHistory,
        createStatusHistoryEntry(updatedItem.status)
      ]
    } else {
      statusHistory = existingItem.statusHistory
    }
  }
  return validateStatusHistory(statusHistory)
}

export const updateStatusHistoryForItems = (existingItems, itemUpdates) => {
  const existingItemsById = new Map(
    existingItems.map((item) => [item.id, item])
  )

  const processedUpdates = itemUpdates.map((updatedItem) => {
    const existingItem = existingItemsById.get(updatedItem.id)
    if (existingItem) {
      existingItemsById.delete(updatedItem.id)
      return {
        ...updatedItem,
        statusHistory: statusHistoryWithChanges(updatedItem, existingItem)
      }
    } else {
      return {
        ...updatedItem,
        statusHistory: createInitialStatusHistory()
      }
    }
  })

  return [...processedUpdates].map((item) => {
    const { status: _, ...remainingFields } = item
    return remainingFields
  })
}

/** @typedef {Pick<CollatedUser, 'fullName'|'email'|'roles'>} SlimUser */

/**
 * get user roles for the provided status
 *
 * @param {Status} status
 * @returns {UserRoles[]}
 */
const getUserRolesForStatus = (status) => {
  if (status === STATUS.CREATED || status === STATUS.APPROVED) {
    return [USER_ROLES.INITIAL, USER_ROLES.STANDARD]
  }
  return [USER_ROLES.STANDARD]
}

/**
 * @param {Organisation} existing
 * @param {Organisation} updated
 * @param {'accreditations'|'registrations'} collectionKey
 * @param {(item: Accreditation|Registration) => SlimUser[]} extractAdditionalUsers
 * @returns {SlimUser[]}
 */
const collateItems = (
  existing,
  updated,
  collectionKey,
  extractAdditionalUsers
) => {
  /** @type {SlimUser[]} */
  const users = []

  for (const item of updated[collectionKey]) {
    const itemStatus = getCurrentStatus(item)
    const existingItem = existing[collectionKey]?.find((i) => i.id === item.id)
    const existingItemStatus = existingItem
      ? getCurrentStatus(existingItem)
      : null

    if (
      itemStatus === STATUS.APPROVED &&
      existingItemStatus !== STATUS.APPROVED
    ) {
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
 * @param {Organisation} existing
 * @param {Organisation} updated
 * @returns {SlimUser[]}
 */
const collateRegistrationUsers = (existing, updated) =>
  collateItems(
    existing,
    updated,
    'registrations',
    (/** @type {Registration} */ registration) =>
      registration.approvedPersons.map(({ email, fullName }) => ({
        fullName,
        email,
        roles: getUserRolesForStatus(getCurrentStatus(registration))
      }))
  )

/**
 * @param {Organisation} existing
 * @param {Organisation} updated
 * @returns {SlimUser[]}
 */
const collateAccreditationUsers = (existing, updated) =>
  collateItems(
    existing,
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
 * Deduplicates users by email address (case-insensitive)
 *
 * @param {SlimUser[]} users
 * @returns {CollatedUser[]}
 */
const deduplicateUsers = (users) => {
  const userMap = new Map()

  for (const user of users) {
    const key = user.email.toLowerCase()

    if (!userMap.has(key)) {
      userMap.set(key, {
        ...user
      })
    }
  }

  return Array.from(userMap.values())
}

/**
 * @param {Organisation} existing
 * @param {Organisation} updated
 * @returns {CollatedUser[]}
 */
export const collateUsers = (existing, updated) => {
  /** @type {SlimUser[]} */
  const root = []

  /* v8 ignore next */
  if (updated.submitterContactDetails) {
    root.push({
      fullName: updated.submitterContactDetails.fullName,
      email: updated.submitterContactDetails.email,
      roles: getUserRolesForStatus(getCurrentStatus(updated))
    })
  }

  const users = [
    ...existing.users,
    ...root,
    ...collateRegistrationUsers(existing, updated),
    ...collateAccreditationUsers(existing, updated)
  ]

  return deduplicateUsers(users)
}

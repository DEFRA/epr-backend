import { STATUS, USER_ROLES } from '#domain/organisations/model.js'
import equal from 'fast-deep-equal'
import { validateStatusHistory } from './schema/index.js'

/** @import {CollatedUser, Organisation, User} from '#domain/organisations/model.js' */
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

export const mergeItemsWithUpdates = (existingItems, itemUpdates) => {
  const updatesById = new Map(itemUpdates.map((item) => [item.id, item]))

  const processedExisting = existingItems.map((existingItem) => {
    const update = updatesById.get(existingItem.id)
    if (update) {
      updatesById.delete(existingItem.id)
      return {
        ...existingItem,
        ...update,
        statusHistory: statusHistoryWithChanges(update, existingItem)
      }
    }
    return existingItem
  })

  const newItems = Array.from(updatesById.values()).map((newItem) => ({
    ...newItem,
    statusHistory: createInitialStatusHistory()
  }))

  return [...processedExisting, ...newItems].map((item) => {
    const { status: _, ...remainingFields } = item
    return remainingFields
  })
}

export const mergeSubcollection = (existingItems, updateItems) =>
  updateItems
    ? mergeItemsWithUpdates(existingItems, updateItems)
    : existingItems

const removeNullUndefined = (obj) => {
  if (Array.isArray(obj)) {
    return obj.map(removeNullUndefined)
  }

  if (typeof obj === 'object' && obj !== null) {
    const cleaned = {}
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        cleaned[key] = removeNullUndefined(value)
      }
    }
    return cleaned
  }

  return obj
}

const normalizeItem = (item) => {
  if (!item) {
    return item
  }
  const { status: _, statusHistory: _s, ...rest } = item
  return rest
}

export const normalizeForComparison = (org) => {
  if (!org) {
    return org
  }

  const {
    schemaVersion: _sv,
    status: _s,
    statusHistory: _sh,
    users: _u,
    version: _v,
    ...rest
  } = org

  const normalized = {
    ...rest,
    registrations: org.registrations?.map(normalizeItem) ?? [],
    accreditations: org.accreditations?.map(normalizeItem) ?? []
  }

  return removeNullUndefined(normalized)
}

export const hasChanges = (existing, incoming) => {
  const normalizedExisting = normalizeForComparison(existing)
  const normalizedIncoming = normalizeForComparison(incoming)

  return !equal(normalizedExisting, normalizedIncoming)
}

/** @typedef {Pick<User, 'fullName'|'email'>} SlimUser */

/**
 * @param {Organisation} existing
 * @param {Organisation} updated
 * @param {'accreditations'|'registrations'} collectionKey
 * @param {(item: Accreditation|Registration) => SlimUser[]} extractAdditionalUsers
 * @returns {SlimUser[]}
 */
const collateApprovedItems = (
  existing,
  updated,
  collectionKey,
  extractAdditionalUsers
) => {
  /** @type {SlimUser[]} */
  const users = []

  for (const item of updated[collectionKey] || []) {
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
          email: item.submitterContactDetails.email
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
const collateApprovedRegistrations = (existing, updated) =>
  collateApprovedItems(
    existing,
    updated,
    'registrations',
    (/** @type {Registration} */ registration) =>
      registration.approvedPersons.map(({ email, fullName }) => ({
        fullName,
        email
      }))
  )

/**
 * @param {Organisation} existing
 * @param {Organisation} updated
 * @returns {SlimUser[]}
 */
const collateApprovedAccreditations = (existing, updated) =>
  collateApprovedItems(
    existing,
    updated,
    'accreditations',
    (/** @type {Accreditation} */ accreditation) =>
      accreditation.prnIssuance.signatories.map(({ email, fullName }) => ({
        fullName,
        email
      }))
  )

/**
 * @param {Organisation} existing
 * @param {Organisation} updated
 * @returns {CollatedUser[]}
 */
export const collateUsersOnApproval = (existing, updated) => {
  /** @type {SlimUser[]} */
  const root = []

  if (updated.submitterContactDetails) {
    root.push({
      fullName: updated.submitterContactDetails.fullName,
      email: updated.submitterContactDetails.email
    })
  }

  const users = [
    ...root,
    ...collateApprovedRegistrations(existing, updated),
    ...collateApprovedAccreditations(existing, updated)
  ]

  if (users.length > 0) {
    return deduplicateUsers(users)
  }

  return existing.users
}

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
        fullName: user.fullName,
        email: user.email,
        isInitialUser: true,
        roles: [USER_ROLES.STANDARD]
      })
    }
  }

  return Array.from(userMap.values())
}

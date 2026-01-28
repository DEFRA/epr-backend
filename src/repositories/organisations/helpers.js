import { REG_ACC_STATUS, USER_ROLES } from '#domain/organisations/model.js'
import {
  validateOrganisationUpdate,
  validateStatusHistory
} from './schema/index.js'
import {
  applyRegistrationStatusToLinkedAccreditations,
  assertAndHandleItemStateTransition,
  assertOrgStatusTransition
} from '#repositories/organisations/schema/status-transition.js'
import { validateApprovals } from './schema/helpers.js'

/** @import {CollatedUser, Organisation, RegAccStatus, UserRoles} from '#domain/organisations/model.js' */
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
      // Validate status transition for registrations/accreditations
      assertAndHandleItemStateTransition(existingItem, updatedItem)
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
      itemStatus === REG_ACC_STATUS.APPROVED &&
      existingItemStatus !== REG_ACC_STATUS.APPROVED
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
    /* v8 ignore next */
    ...(updated.users ?? []),
    ...root,
    ...collateRegistrationUsers(existing, updated),
    ...collateAccreditationUsers(existing, updated)
  ]

  return deduplicateUsers(users)
}

export const mapDocumentWithCurrentStatuses = (org) => {
  const { _id, ...rest } = org

  rest.status = getCurrentStatus(rest)

  for (const item of rest.registrations) {
    item.status = getCurrentStatus(item)
  }

  for (const item of rest.accreditations) {
    item.status = getCurrentStatus(item)
  }

  return { id: _id.toString(), ...rest }
}

function prepareRegAccForReplace(validated, existing) {
  const accreditationsAfterUpdate =
    applyRegistrationStatusToLinkedAccreditations(
      validated.registrations,
      validated.accreditations
    )
  validateApprovals(validated.registrations, accreditationsAfterUpdate)
  const registrations = updateStatusHistoryForItems(
    existing.registrations,
    validated.registrations
  )

  const accreditations = updateStatusHistoryForItems(
    existing.accreditations,
    accreditationsAfterUpdate
  )
  return { registrations, accreditations }
}

export const prepareForReplace = (existing, updates) => {
  const validated = validateOrganisationUpdate(updates, existing)
  const { registrations, accreditations } = prepareRegAccForReplace(
    validated,
    existing
  )

  const updatedStatusHistory = statusHistoryWithChanges(validated, existing)

  const users = collateUsers(existing, {
    ...validated,
    statusHistory: updatedStatusHistory,
    registrations,
    accreditations
  })

  const { status: _, ...updatesWithoutStatus } = {
    ...validated
  }

  assertOrgStatusTransition(existing, validated)

  return {
    ...updatesWithoutStatus,
    statusHistory: updatedStatusHistory,
    registrations,
    accreditations,
    users,
    version: existing.version + 1
  }
}

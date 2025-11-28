import { STATUS, USER_ROLES } from '#domain/organisations/model.js'
import equal from 'fast-deep-equal'
import { validateStatusHistory } from './schema/index.js'

/** @import {CollatedUser, Organisation, User} from '#domain/organisations/model.js' */

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

  return [...processedExisting, ...newItems]
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
  const { status, statusHistory, ...rest } = item
  return rest
}

export const normalizeForComparison = (org) => {
  if (!org) {
    return org
  }

  const { version, schemaVersion, status, statusHistory, users, ...rest } = org

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

/**
 * @param {Organisation} existing
 * @param {Organisation} updated
 * @returns {CollatedUser[]}
 */
export const collateUsersOnApproval = (existing, updated) => {
  const users = []

  if (updated.submitterContactDetails) {
    users.push({
      fullName: updated.submitterContactDetails.fullName,
      email: updated.submitterContactDetails.email
    })
  }

  for (const registration of updated.registrations || []) {
    const regStatus = getCurrentStatus(registration)
    const existingReg = existing.registrations?.find(
      (r) => r.id === registration.id
    )
    const existingRegStatus = existingReg ? getCurrentStatus(existingReg) : null

    if (
      regStatus === STATUS.APPROVED &&
      existingRegStatus !== STATUS.APPROVED
    ) {
      users.push({
        fullName: registration.submitterContactDetails.fullName,
        email: registration.submitterContactDetails.email
      })

      for (const person of registration.approvedPersons) {
        users.push({
          fullName: person.fullName,
          email: person.email
        })
      }
    }
  }

  for (const accreditation of updated.accreditations || []) {
    const accStatus = getCurrentStatus(accreditation)
    const existingAcc = existing.accreditations?.find(
      (a) => a.id === accreditation.id
    )
    const existingAccStatus = existingAcc ? getCurrentStatus(existingAcc) : null

    if (
      accStatus === STATUS.APPROVED &&
      existingAccStatus !== STATUS.APPROVED
    ) {
      users.push({
        fullName: accreditation.submitterContactDetails.fullName,
        email: accreditation.submitterContactDetails.email
      })

      for (const signatory of accreditation.prnIssuance.signatories) {
        users.push({
          fullName: signatory.fullName,
          email: signatory.email
        })
      }
    }
  }

  if (users.length > 0) {
    return deduplicateUsers(users)
  }

  return existing.users
}

/**
 * Collates users from organisation, approved registrations, and approved accreditations, deduplicating by email
 *
 * @param {object} organisation - Organisation with submitterContactDetails, registrations, and accreditations
 * @returns {CollatedUser[]}
 */
export const collateUsersFromOrganisation = (organisation) => {
  const users = []

  if (organisation.submitterContactDetails) {
    users.push({
      fullName: organisation.submitterContactDetails.fullName,
      email: organisation.submitterContactDetails.email
    })
  }

  for (const registration of organisation.registrations || []) {
    const regStatus = getCurrentStatus(registration)

    if (regStatus === STATUS.APPROVED) {
      users.push({
        fullName: registration.submitterContactDetails.fullName,
        email: registration.submitterContactDetails.email
      })

      for (const person of registration.approvedPersons) {
        users.push({
          fullName: person.fullName,
          email: person.email
        })
      }
    }
  }

  for (const accreditation of organisation.accreditations || []) {
    const accStatus = getCurrentStatus(accreditation)

    if (accStatus === STATUS.APPROVED) {
      users.push({
        fullName: accreditation.submitterContactDetails.fullName,
        email: accreditation.submitterContactDetails.email
      })

      for (const signatory of accreditation.prnIssuance.signatories) {
        users.push({
          fullName: signatory.fullName,
          email: signatory.email
        })
      }
    }
  }

  return deduplicateUsers(users)
}

/**
 * Deduplicates users by email address (case-insensitive)
 *
 * @param {Array<{fullName: string, email: string}>} users
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

/**
 * Create users from submitter contact details (legacy - use collateUsersFromOrganisation)
 *
 * @param {User} submitterContactDetails
 * @returns {CollatedUser[]}
 */
export const createUsersFromSubmitter = (submitterContactDetails) => {
  if (!submitterContactDetails) {
    return []
  }

  return [
    {
      fullName: submitterContactDetails.fullName,
      email: submitterContactDetails.email,
      isInitialUser: true,
      roles: [USER_ROLES.STANDARD]
    }
  ]
}

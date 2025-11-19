import { validateStatusHistory } from './schema/index.js'
import equal from 'fast-deep-equal'

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

  const { version, schemaVersion, status, statusHistory, ...rest } = org

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

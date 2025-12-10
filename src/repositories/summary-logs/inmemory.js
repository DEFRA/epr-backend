import Boom from '@hapi/boom'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  validateId,
  validateSummaryLogInsert,
  validateSummaryLogUpdate
} from './validation.js'

const scheduleStaleCacheSync = (storage, staleCache) => {
  // Schedule sync for next tick to simulate replication lag
  setImmediate(() => {
    staleCache.clear()
    for (const [key, value] of storage) {
      staleCache.set(key, structuredClone(value))
    }
  })
}

/**
 * Create an in-memory summary logs repository.
 * Simulates eventual consistency by maintaining separate storage and staleCache.
 * Updates are asynchronously synced to staleCache to simulate replication lag.
 *
 * @returns {import('./port.js').SummaryLogsRepositoryFactory}
 */
export const createInMemorySummaryLogsRepository = () => {
  const storage = new Map()
  const staleCache = new Map()

  return (logger) => ({
    async insert(id, summaryLog) {
      const validatedId = validateId(id)
      const validatedSummaryLog = validateSummaryLogInsert(summaryLog)

      if (storage.has(validatedId)) {
        throw Boom.conflict(`Summary log with id ${validatedId} already exists`)
      }

      const newDoc = {
        version: 1,
        summaryLog: structuredClone(validatedSummaryLog)
      }

      storage.set(validatedId, newDoc)
      // Insert is immediately visible (no lag simulation for inserts)
      staleCache.set(validatedId, structuredClone(newDoc))
    },

    async update(id, version, updates) {
      const validatedId = validateId(id)
      const validatedUpdates = validateSummaryLogUpdate(updates)

      const existing = storage.get(validatedId)

      if (!existing) {
        throw Boom.notFound(`Summary log with id ${validatedId} not found`)
      }

      if (existing.version !== version) {
        const conflictError = new Error(
          `Version conflict: attempted to update with version ${version} but current version is ${existing.version}`
        )

        logger.error({
          error: conflictError,
          message: `Version conflict detected for summary log ${validatedId}`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.DB,
            action: LOGGING_EVENT_ACTIONS.VERSION_CONFLICT_DETECTED,
            reference: validatedId
          }
        })

        throw Boom.conflict(conflictError.message)
      }

      storage.set(validatedId, {
        version: existing.version + 1,
        summaryLog: structuredClone({
          ...existing.summaryLog,
          ...validatedUpdates
        })
      })

      // Schedule async staleCache update to simulate replication lag
      scheduleStaleCacheSync(storage, staleCache)
    },

    async findById(id) {
      const validatedId = validateId(id)
      // Read from staleCache to simulate reading from replica
      const doc = staleCache.get(validatedId)
      if (!doc) {
        return null
      }
      return {
        version: doc.version,
        summaryLog: structuredClone(doc.summaryLog)
      }
    },

    async hasSubmittingLog(organisationId, registrationId) {
      for (const doc of storage.values()) {
        if (
          doc.summaryLog.organisationId === organisationId &&
          doc.summaryLog.registrationId === registrationId &&
          doc.summaryLog.status === 'submitting'
        ) {
          return true
        }
      }
      return false
    },

    async supersedePendingLogs(organisationId, registrationId, excludeId) {
      const pendingStatuses = ['preprocessing', 'validating', 'validated']
      let count = 0

      for (const [id, doc] of storage) {
        if (
          id !== excludeId &&
          doc.summaryLog.organisationId === organisationId &&
          doc.summaryLog.registrationId === registrationId &&
          pendingStatuses.includes(doc.summaryLog.status)
        ) {
          const newDoc = {
            version: doc.version + 1,
            summaryLog: structuredClone({
              ...doc.summaryLog,
              status: 'superseded'
            })
          }
          storage.set(id, newDoc)
          // Supersede is immediately visible (like insert) for test consistency
          staleCache.set(id, structuredClone(newDoc))
          count++
        }
      }

      return count
    },

    async hasNewerValidatedLog(organisationId, registrationId, excludeId) {
      for (const [id, doc] of storage) {
        if (
          id !== excludeId &&
          doc.summaryLog.organisationId === organisationId &&
          doc.summaryLog.registrationId === registrationId &&
          doc.summaryLog.status === 'validated'
        ) {
          return true
        }
      }
      return false
    }
  })
}

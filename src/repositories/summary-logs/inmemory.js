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

const insert = (storage, staleCache) => async (id, summaryLog) => {
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
}

const update =
  (storage, staleCache, logger) => async (id, version, updates) => {
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
    scheduleStaleCacheSync(storage, staleCache)
  }

const findById = (staleCache) => async (id) => {
  const validatedId = validateId(id)
  // Read from staleCache to simulate reading from replica
  const doc = staleCache.get(validatedId)
  if (!doc) {
    return null
  }
  return { version: doc.version, summaryLog: structuredClone(doc.summaryLog) }
}

const findLatestSubmittedForOrgReg =
  (staleCache) => async (organisationId, registrationId) => {
    let latestId = null
    let latestDoc = null
    let latestSubmittedAt = null

    for (const [id, doc] of staleCache) {
      if (
        doc.summaryLog.organisationId === organisationId &&
        doc.summaryLog.registrationId === registrationId &&
        doc.summaryLog.status === 'submitted'
      ) {
        const { submittedAt } = doc.summaryLog

        // Return the most recently submitted summary log
        if (latestDoc === null || submittedAt > latestSubmittedAt) {
          latestId = id
          latestDoc = doc
          latestSubmittedAt = submittedAt
        }
      }
    }

    if (!latestDoc) {
      return null
    }

    return {
      id: latestId,
      version: latestDoc.version,
      summaryLog: structuredClone(latestDoc.summaryLog)
    }
  }

const transitionToSubmittingExclusive =
  (storage, staleCache) => async (logId) => {
    const validatedId = validateId(logId)
    const existing = storage.get(validatedId)

    // Verify summary log exists
    if (!existing) {
      throw Boom.notFound(`Summary log with id ${validatedId} not found`)
    }

    // Verify summary log is in validated status
    if (existing.summaryLog.status !== 'validated') {
      throw Boom.conflict(
        `Summary log must be validated before submission. Current status: ${existing.summaryLog.status}`
      )
    }

    const { organisationId, registrationId } = existing.summaryLog

    // Pre-check: is another log for same org/reg already submitting?
    // Read from storage (strong consistency) - in single-threaded JS,
    // true race conditions can't occur like they can in MongoDB with
    // network I/O interleaving.
    for (const [id, doc] of storage) {
      if (
        id !== validatedId &&
        doc.summaryLog.organisationId === organisationId &&
        doc.summaryLog.registrationId === registrationId &&
        doc.summaryLog.status === 'submitting'
      ) {
        return { success: false }
      }
    }

    // Transition to submitting
    const updatedSummaryLog = {
      ...existing.summaryLog,
      status: 'submitting',
      submittedAt: new Date().toISOString()
    }
    const newVersion = existing.version + 1

    const newDoc = {
      version: newVersion,
      summaryLog: structuredClone(updatedSummaryLog)
    }
    storage.set(validatedId, newDoc)
    scheduleStaleCacheSync(storage, staleCache)

    return {
      success: true,
      summaryLog: structuredClone(updatedSummaryLog),
      version: newVersion
    }
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
    insert: insert(storage, staleCache),
    update: update(storage, staleCache, logger),
    findById: findById(staleCache),
    findLatestSubmittedForOrgReg: findLatestSubmittedForOrgReg(staleCache),
    transitionToSubmittingExclusive: transitionToSubmittingExclusive(
      storage,
      staleCache
    )
  })
}

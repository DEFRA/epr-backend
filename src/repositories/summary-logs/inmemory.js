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

const hasSubmittingLogForOrgReg = (
  staleCache,
  organisationId,
  registrationId
) => {
  for (const [, doc] of staleCache) {
    if (
      doc.summaryLog.organisationId === organisationId &&
      doc.summaryLog.registrationId === registrationId &&
      doc.summaryLog.status === 'submitting'
    ) {
      return true
    }
  }
  return false
}

const insert = (storage, staleCache) => async (id, summaryLog) => {
  const validatedId = validateId(id)
  const validatedSummaryLog = validateSummaryLogInsert(summaryLog)

  if (storage.has(validatedId)) {
    throw Boom.conflict(`Summary log with id ${validatedId} already exists`)
  }

  // Check for existing submitting log for same org/reg (read from staleCache for eventual consistency)
  const { organisationId, registrationId } = validatedSummaryLog
  if (hasSubmittingLogForOrgReg(staleCache, organisationId, registrationId)) {
    throw Boom.conflict('A submission is in progress. Please wait.')
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

const PENDING_STATUSES = new Set(['preprocessing', 'validating', 'validated'])

const isPendingLogForOrgReg = (
  id,
  doc,
  organisationId,
  registrationId,
  excludeId
) =>
  id !== excludeId &&
  doc.summaryLog.organisationId === organisationId &&
  doc.summaryLog.registrationId === registrationId &&
  PENDING_STATUSES.has(doc.summaryLog.status)

const findPendingLogs = (
  staleCache,
  organisationId,
  registrationId,
  excludeId
) => {
  const docs = []
  for (const [id, doc] of staleCache) {
    if (
      isPendingLogForOrgReg(id, doc, organisationId, registrationId, excludeId)
    ) {
      docs.push({ id, version: doc.version })
    }
  }
  return docs
}

const applySupersede = (storage, docsToSupersede) => {
  let count = 0
  for (const { id, version } of docsToSupersede) {
    const current = storage.get(id)
    if (current && current.version === version) {
      storage.set(id, {
        version: current.version + 1,
        summaryLog: structuredClone({
          ...current.summaryLog,
          status: 'superseded'
        })
      })
      count++
    }
  }
  return count
}

const checkForSubmittingLog =
  (staleCache) => async (organisationId, registrationId) => {
    if (hasSubmittingLogForOrgReg(staleCache, organisationId, registrationId)) {
      throw Boom.conflict('A submission is in progress. Please wait.')
    }
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
  (storage, staleCache, logger) =>
  async (logId, version, organisationId, registrationId) => {
    const validatedId = validateId(logId)
    const existing = storage.get(validatedId)

    // Verify summary log exists
    if (!existing) {
      throw Boom.notFound(`Summary log with id ${validatedId} not found`)
    }

    // Verify summary log is in validated status
    if (existing.summaryLog.status !== 'validated') {
      throw Boom.conflict(
        `Summary log ${validatedId} is not in validated status`
      )
    }

    // Verify version matches (optimistic concurrency)
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

    // Pre-check: is another log for same org/reg already submitting?
    // Read from storage (strong consistency) - in single-threaded JS,
    // true race conditions can't occur like they can in MongoDB with
    // network I/O interleaving. The post-check exists for MongoDB's benefit.
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
    // Note: Unlike MongoDB where network I/O can interleave and cause races,
    // JavaScript's single-threaded nature means races can't occur here.
    // MongoDB has post-check logic to detect/resolve races, but it's not
    // needed for in-memory. The pre-check above (strong consistency) ensures
    // only one transition succeeds.
    scheduleStaleCacheSync(storage, staleCache)

    return {
      success: true,
      summaryLog: structuredClone(updatedSummaryLog),
      version: newVersion
    }
  }

const supersedePendingLogs =
  (storage, staleCache) =>
  async (organisationId, registrationId, excludeId) => {
    // Find from staleCache (replica) to provide weaker consistency guarantees
    const docsToSupersede = findPendingLogs(
      staleCache,
      organisationId,
      registrationId,
      excludeId
    )

    if (docsToSupersede.length === 0) {
      return 0
    }

    // Update with optimistic concurrency (version checking)
    const count = applySupersede(storage, docsToSupersede)

    if (count > 0) {
      scheduleStaleCacheSync(storage, staleCache)
    }
    return count
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
    supersedePendingLogs: supersedePendingLogs(storage, staleCache),
    checkForSubmittingLog: checkForSubmittingLog(staleCache),
    findLatestSubmittedForOrgReg: findLatestSubmittedForOrgReg(staleCache),
    transitionToSubmittingExclusive: transitionToSubmittingExclusive(
      storage,
      staleCache,
      logger
    )
  })
}

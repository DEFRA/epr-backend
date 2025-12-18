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
    checkForSubmittingLog: checkForSubmittingLog(staleCache)
  })
}

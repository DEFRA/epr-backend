import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  SUMMARY_LOG_FAILURE_STATUS,
  SUMMARY_LOG_STATUS
} from '#domain/summary-logs/status.js'
import Boom from '@hapi/boom'
import { holdsNumbers } from '#domain/summary-logs/numbers.js'
import { parseSummaryLogUri } from './parse-uri.js'
import { keyedBy } from './natural-keys.js'
import {
  validateId,
  validateSummaryLogInsert,
  validateSummaryLogKey,
  validateSummaryLogNumbers,
  validateSummaryLogUpdate
} from './validation.js'

const FAILURE_STATUS = new Set(SUMMARY_LOG_FAILURE_STATUS)

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
        err: conflictError,
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

const findIdsWithoutNumbers = (storage) => async () =>
  [...storage]
    .filter(([, { summaryLog }]) => !holdsNumbers(summaryLog))
    .map(([id]) => id)

const assignNumbers =
  (storage, staleCache, logger) => async (id, version, numbers) => {
    const validatedId = validateId(id)
    const validatedNumbers = validateSummaryLogNumbers(numbers)
    const existing = storage.get(validatedId)

    if (!existing) {
      throw Boom.notFound(`Summary log with id ${validatedId} not found`)
    }

    const held = Object.keys(validatedNumbers).filter(
      (key) => existing.summaryLog[key] !== undefined
    )
    if (existing.version !== version || held.length > 0) {
      const conflictError = new Error(
        `Version conflict: attempted to assign numbers with version ${version} but current version is ${existing.version}, already holds ${held.join(', ') || 'none'}`
      )
      logger.error({
        err: conflictError,
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
        ...validatedNumbers
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

/**
 * @import { SummaryLog } from '#domain/summary-logs/model.js'
 * @import { SummaryLogStatus } from '#domain/summary-logs/status.js'
 * @import { SummaryLogKey } from '#domain/summary-logs/numbers.js'
 * @import { SummaryLogVersion, SummaryLogWithId } from './port.js'
 *
 * @typedef {Map<string, SummaryLogVersion>} SummaryLogStore
 * @typedef {(summaryLog: SummaryLog) => boolean} SummaryLogMatch
 */

/**
 * @param {SummaryLogStore} staleCache
 * @param {SummaryLogMatch} matches
 * @returns {SummaryLogWithId | null}
 */
const latestSubmitted = (staleCache, matches) => {
  /** @type {{ id: string, doc: SummaryLogVersion, submittedAt: string } | null} */
  let latest = null

  for (const [id, doc] of staleCache) {
    if (doc.summaryLog.status === 'submitted' && matches(doc.summaryLog)) {
      const submittedAt = /** @type {string} */ (doc.summaryLog.submittedAt)

      // Return the most recently submitted summary log
      if (
        latest === null ||
        submittedAt.localeCompare(latest.submittedAt) > 0
      ) {
        latest = { id, doc, submittedAt }
      }
    }
  }

  if (!latest) {
    return null
  }

  return {
    id: latest.id,
    version: latest.doc.version,
    summaryLog: structuredClone(latest.doc.summaryLog)
  }
}

/** @type {Set<SummaryLogStatus>} */
const TERMINAL_STATUS = new Set([
  SUMMARY_LOG_STATUS.SUBMITTED,
  ...SUMMARY_LOG_FAILURE_STATUS
])

/**
 * Submitted and failed summary logs, newest upload first.
 *
 * @param {SummaryLogStore} staleCache
 * @param {SummaryLogMatch} matches
 * @returns {SummaryLogWithId[]}
 */
const uploads = (staleCache, matches) => {
  const found = []

  for (const [id, doc] of staleCache) {
    const { summaryLog } = doc
    if (TERMINAL_STATUS.has(summaryLog.status) && matches(summaryLog)) {
      found.push({
        id,
        version: doc.version,
        summaryLog: structuredClone(summaryLog),
        _uploadedAt: summaryLog.submittedAt ?? summaryLog.createdAt
      })
    }
  }

  found.sort((a, b) => b._uploadedAt.localeCompare(a._uploadedAt))

  return found.map(({ _uploadedAt: _u, ...rest }) => rest)
}

/**
 * A summary log stored before its accreditation was recorded has no
 * accreditation number, and matches every accreditation.
 *
 * @param {SummaryLogKey['accreditationNumber']} accreditationNumber
 * @returns {SummaryLogMatch}
 */
const matchesAccreditation = (accreditationNumber) => (summaryLog) =>
  accreditationNumber === undefined ||
  summaryLog.accreditationNumber === undefined ||
  summaryLog.accreditationNumber === accreditationNumber

/**
 * @param {SummaryLogKey['year']} year
 * @returns {SummaryLogMatch}
 */
const matchesYear = (year) => (summaryLog) =>
  year === undefined || summaryLog.year === year

/**
 * @param {SummaryLogKey} key
 * @returns {SummaryLogMatch}
 */
const matchesKey = (key) => {
  const { organisationNumber, registrationNumber, accreditationNumber, year } =
    validateSummaryLogKey(key)
  return (summaryLog) =>
    summaryLog.organisationNumber === organisationNumber &&
    summaryLog.registrationNumber === registrationNumber &&
    matchesAccreditation(accreditationNumber)(summaryLog) &&
    matchesYear(year)(summaryLog)
}

/** @param {SummaryLogStore} staleCache */
const findLatestSubmitted =
  (staleCache) =>
  /** @param {SummaryLogKey} key */
  async (key) => {
    const found = latestSubmitted(staleCache, matchesKey(key))
    return found && keyedBy(key)(found)
  }

/** @param {SummaryLogStore} staleCache */
const findAll =
  (staleCache) =>
  /** @param {SummaryLogKey} key */
  async (key) =>
    uploads(staleCache, matchesKey(key)).map(keyedBy(key))

const findAllSummaryLogStatsByRegistrationId = (staleCache) => async () => {
  const statsMap = Array.from(staleCache.values()).reduce(
    (acc, { summaryLog: doc }) => {
      const { organisationId, registrationId, status } = doc
      const key = `${organisationId}:${registrationId}`

      const group = acc.get(key) || {
        organisationId,
        registrationId,
        lastSuccessful: null,
        lastFailed: null,
        successfulCount: 0,
        failedCount: 0
      }

      const prefix = FAILURE_STATUS.has(status) ? 'failed' : 'successful'
      const dateKey = prefix === 'failed' ? 'lastFailed' : 'lastSuccessful'
      group[`${prefix}Count`]++
      const dateField = prefix === 'successful' ? 'submittedAt' : 'createdAt'
      if (!group[dateKey] || doc[dateField] > group[dateKey]) {
        group[dateKey] = doc[dateField]
      }

      return acc.set(key, group)
    },
    new Map()
  )

  return Array.from(statsMap.values(), (stats) => ({
    ...stats,
    lastSuccessful: stats.lastSuccessful
      ? new Date(stats.lastSuccessful)
      : null,
    lastFailed: stats.lastFailed ? new Date(stats.lastFailed) : null
  }))
}

const SIXTY_SECONDS = 60

const signDownload = (doc, reference) => {
  if (!doc?.summaryLog?.file?.uri) {
    throw Boom.notFound('Summary log file not found')
  }

  const { Bucket, Key } = parseSummaryLogUri(doc.summaryLog.file.uri, reference)
  const url = `https://${Bucket}.test/${Key}/download`
  const expiresAt = new Date(Date.now() + SIXTY_SECONDS * 1000).toISOString()

  return { url, expiresAt }
}

const getDownloadUrl = (staleCache) => async (summaryLogId) => {
  const validatedId = validateId(summaryLogId)

  return signDownload(staleCache.get(validatedId), validatedId)
}

const getDownloadUrlByFileId = (staleCache) => async (fileId) => {
  const validatedId = validateId(fileId)
  const doc = [...staleCache.values()].find(
    (held) => held?.summaryLog?.file?.id === validatedId
  )

  return signDownload(doc, validatedId)
}

/**
 * Whether `candidate` collides with `subject` for the submitting-lock check:
 * same org/reg, already submitting, and the same year and accreditation.
 */
const collidesOnSubmittingLock = (candidate, subject) =>
  candidate.organisationId === subject.organisationId &&
  candidate.registrationId === subject.registrationId &&
  candidate.status === 'submitting' &&
  candidate.year === subject.year &&
  candidate.accreditationId === subject.accreditationId

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

    // Pre-check: is another log for the same org/reg/year/accreditationId
    // already submitting? Read from storage (strong consistency) - in
    // single-threaded JS, true race conditions can't occur like they can in
    // MongoDB with network I/O interleaving.
    for (const [id, doc] of storage) {
      if (
        id !== validatedId &&
        collidesOnSubmittingLock(doc.summaryLog, existing.summaryLog)
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
    findIdsWithoutNumbers: findIdsWithoutNumbers(storage),
    assignNumbers: assignNumbers(storage, staleCache, logger),
    findLatestSubmitted: findLatestSubmitted(staleCache),
    findAll: findAll(staleCache),
    findAllSummaryLogStatsByRegistrationId:
      findAllSummaryLogStatsByRegistrationId(staleCache),
    transitionToSubmittingExclusive: transitionToSubmittingExclusive(
      storage,
      staleCache
    ),
    getDownloadUrl: getDownloadUrl(staleCache),
    getDownloadUrlByFileId: getDownloadUrlByFileId(staleCache)
  })
}

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  SUMMARY_LOG_FAILURE_STATUS,
  SUMMARY_LOG_STATUS
} from '#domain/summary-logs/status.js'
import Boom from '@hapi/boom'
import { parseSummaryLogUri } from './parse-uri.js'
import { yearSchema } from '#common/validation/year-schema.js'
import {
  validateId,
  validateSummaryLogInsert,
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

const isUnset = (year) => year === undefined || year === null

const findIdsWithoutYear = (storage) => async () =>
  [...storage]
    .filter(([, { summaryLog }]) => isUnset(summaryLog.year))
    .map(([id]) => id)

const assignYear =
  (storage, staleCache, logger) => async (id, version, year) => {
    const validatedId = validateId(id)
    const { error, value: validatedYear } = yearSchema()
      .required()
      .validate(year)
    if (error) {
      throw Boom.badData(error.message)
    }
    const existing = storage.get(validatedId)

    if (!existing) {
      throw Boom.notFound(`Summary log with id ${validatedId} not found`)
    }

    if (existing.version !== version || !isUnset(existing.summaryLog.year)) {
      const conflictError = new Error(
        `Version conflict: attempted to assign year with version ${version} but current version is ${existing.version}, year is ${existing.summaryLog.year ?? 'unset'}`
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
        year: validatedYear
      })
    })
    scheduleStaleCacheSync(storage, staleCache)
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
 * A year/accreditation match that also matches legacy documents, so they
 * keep counting until the backfill assigns them a scope. When the caller
 * doesn't know the year (`year === undefined`), every document matches,
 * keeping the registration-wide behaviour untouched.
 *
 * - No `year`: matches every year and accreditation.
 * - A `year` but no `accreditationId`: a backfilled legacy document, which
 *   matches any accreditation in its year. Year-scoped inserts always write
 *   it (`null` for registered-only), so undefined only means it predates it.
 *
 * `null` and `undefined` are the same value, as in MongoDB.
 *
 * @param {import('#domain/summary-logs/model.js').SummaryLog} summaryLog
 * @param {{year?: number, accreditationId?: string | null}} yearAndAccreditation
 * @returns {boolean}
 */
const matchesYear = (summaryLog, { year, accreditationId }) =>
  year === undefined ||
  summaryLog.year === undefined ||
  summaryLog.year === null ||
  (summaryLog.year === year &&
    (summaryLog.accreditationId === undefined ||
      (summaryLog.accreditationId ?? null) === (accreditationId ?? null)))

const findLatestSubmittedForOrgReg =
  (staleCache) =>
  /** @param {import('./port.js').SummaryLogScope} scope */
  async ({ organisationId, registrationId, year, accreditationId }) => {
    /** @type {{ id: string, doc: any, submittedAt: string } | null} */
    let latest = null

    for (const [id, doc] of staleCache) {
      if (
        doc.summaryLog.organisationId === organisationId &&
        doc.summaryLog.registrationId === registrationId &&
        doc.summaryLog.status === 'submitted' &&
        matchesYear(doc.summaryLog, { year, accreditationId })
      ) {
        const { submittedAt } = doc.summaryLog

        // Return the most recently submitted summary log
        if (latest === null || submittedAt > latest.submittedAt) {
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

const TERMINAL_STATUS = new Set([
  SUMMARY_LOG_STATUS.SUBMITTED,
  ...SUMMARY_LOG_FAILURE_STATUS
])

const findAllByOrgReg =
  (staleCache) => async (organisationId, registrationId) => {
    const matches = []

    for (const [id, doc] of staleCache) {
      const { summaryLog } = doc
      if (
        summaryLog.organisationId === organisationId &&
        summaryLog.registrationId === registrationId &&
        TERMINAL_STATUS.has(summaryLog.status)
      ) {
        matches.push({
          id,
          version: doc.version,
          summaryLog: structuredClone(summaryLog),
          _uploadedAt: summaryLog.submittedAt ?? summaryLog.createdAt
        })
      }
    }

    matches.sort((a, b) => b._uploadedAt.localeCompare(a._uploadedAt))

    return matches.map(({ _uploadedAt: _u, ...rest }) => rest)
  }

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
 * same org/reg, already submitting, and the same year and accreditation. A
 * legacy document (no `year`) only collides with another legacy document,
 * matching today's org/reg-only behaviour until the backfill assigns every
 * document a year.
 */
const collidesOnSubmittingLock = (candidate, subject) => {
  if (
    candidate.organisationId !== subject.organisationId ||
    candidate.registrationId !== subject.registrationId ||
    candidate.status !== 'submitting'
  ) {
    return false
  }

  if (subject.year === undefined) {
    return candidate.year === undefined
  }

  return (
    candidate.year === subject.year &&
    candidate.accreditationId === subject.accreditationId
  )
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
    findIdsWithoutYear: findIdsWithoutYear(storage),
    assignYear: assignYear(storage, staleCache, logger),
    findLatestSubmittedForOrgReg: findLatestSubmittedForOrgReg(staleCache),
    findAllByOrgReg: findAllByOrgReg(staleCache),
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

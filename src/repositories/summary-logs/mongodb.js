import Boom from '@hapi/boom'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  SUMMARY_LOG_STATUS,
  calculateExpiresAt
} from '#domain/summary-logs/status.js'
import {
  validateId,
  validateSummaryLogInsert,
  validateSummaryLogUpdate
} from './validation.js'

const COLLECTION_NAME = 'summary-logs'
const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000

/**
 * Ensures the collection exists with required indexes.
 * Safe to call multiple times - MongoDB createIndex is idempotent.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<import('mongodb').Collection>}
 */
async function ensureCollection(db) {
  const collection = db.collection(COLLECTION_NAME)

  // Enforces at most one summary log in 'submitting' status per org/reg pair
  // This prevents race conditions when two users try to confirm simultaneously
  await collection.createIndex(
    { organisationId: 1, registrationId: 1 },
    {
      unique: true,
      partialFilterExpression: { status: 'submitting' }
    }
  )

  // TTL index for automatic cleanup of non-submitted summary logs
  await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })

  // Optimises findLatestSubmittedForOrgReg query which filters by org/reg/status
  // and sorts by submittedAt descending
  await collection.createIndex({
    organisationId: 1,
    registrationId: 1,
    status: 1,
    submittedAt: -1
  })

  return collection
}

const insert = (db) => async (id, summaryLog) => {
  const validatedId = validateId(id)
  const validatedSummaryLog = validateSummaryLogInsert(summaryLog)

  try {
    await db
      .collection(COLLECTION_NAME)
      .insertOne({ _id: validatedId, version: 1, ...validatedSummaryLog })
  } catch (error) {
    if (error.code === MONGODB_DUPLICATE_KEY_ERROR_CODE) {
      throw Boom.conflict(`Summary log with id ${validatedId} already exists`)
    }
    throw error
  }
}

const update = (db, logger) => async (id, version, updates) => {
  const validatedId = validateId(id)
  const validatedUpdates = validateSummaryLogUpdate(updates)

  /** @type {any} */
  const filter = { _id: validatedId, version }
  const result = await db
    .collection(COLLECTION_NAME)
    .updateOne(filter, { $set: validatedUpdates, $inc: { version: 1 } })

  if (result.matchedCount === 0) {
    /** @type {any} */
    const findFilter = { _id: validatedId }
    const existing = await db.collection(COLLECTION_NAME).findOne(findFilter)

    if (!existing) {
      throw Boom.notFound(`Summary log with id ${validatedId} not found`)
    }

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
}

const findById = (db) => async (id) => {
  const validatedId = validateId(id)
  /** @type {any} */
  const findByIdFilter = { _id: validatedId }
  const doc = await db.collection(COLLECTION_NAME).findOne(findByIdFilter)
  if (!doc) {
    return null
  }
  const { _id, version, ...summaryLog } = doc
  return { version, summaryLog }
}

const findLatestSubmittedForOrgReg =
  (db) => async (organisationId, registrationId) => {
    /** @type {any} */
    const filter = {
      organisationId,
      registrationId,
      status: SUMMARY_LOG_STATUS.SUBMITTED
    }

    const doc = await db
      .collection(COLLECTION_NAME)
      .findOne(filter, { sort: { submittedAt: -1 } })

    if (!doc) {
      return null
    }

    const { _id, version, ...summaryLog } = doc
    return { id: _id, version, summaryLog }
  }

const transitionToSubmittingExclusive = (db) => async (logId) => {
  const validatedId = validateId(logId)

  // First, verify the document exists and check its current state
  /** @type {any} */
  const findFilter = { _id: validatedId }
  const existing = await db.collection(COLLECTION_NAME).findOne(findFilter)

  if (!existing) {
    throw Boom.notFound(`Summary log with id ${validatedId} not found`)
  }

  if (existing.status !== SUMMARY_LOG_STATUS.VALIDATED) {
    throw Boom.conflict(
      `Summary log must be validated before submission. Current status: ${existing.status}`
    )
  }

  const { organisationId, registrationId } = existing

  // Check if another log for same org/reg is already submitting (fast path)
  /** @type {any} */
  const submittingFilter = {
    _id: { $ne: validatedId },
    organisationId,
    registrationId,
    status: SUMMARY_LOG_STATUS.SUBMITTING
  }
  const existingSubmitting = await db
    .collection(COLLECTION_NAME)
    .findOne(submittingFilter)

  if (existingSubmitting) {
    return { success: false }
  }

  // Atomically transition to submitting
  // The unique partial index on (organisationId, registrationId) where status='submitting'
  // ensures only one document can be in submitting status per org/reg at a time
  const submittedAt = new Date().toISOString()
  const expiresAt = calculateExpiresAt(SUMMARY_LOG_STATUS.SUBMITTING)
  /** @type {any} */
  const updateFilter = {
    _id: validatedId,
    status: SUMMARY_LOG_STATUS.VALIDATED
  }

  try {
    const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
      updateFilter,
      {
        $set: { status: SUMMARY_LOG_STATUS.SUBMITTING, submittedAt, expiresAt },
        $inc: { version: 1 }
      },
      { returnDocument: 'after' }
    )

    // If update failed due to status mismatch, another transaction beat us
    if (!result) {
      return { success: false }
    }

    // Extract summaryLog from result (remove _id and version)
    const { _id, version: newVersion, ...summaryLog } = result
    return {
      success: true,
      summaryLog,
      version: newVersion
    }
  } catch (error) {
    // Unique index violation means another document for same org/reg is already submitting
    // This can happen in a race even if the pre-check passed
    if (error.code === MONGODB_DUPLICATE_KEY_ERROR_CODE) {
      return { success: false }
    }
    throw error
  }
}

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {import('#common/helpers/logging/logger.js').TypedLogger} logger
 * @returns {Promise<import('./port.js').SummaryLogsRepository>}
 */
export const createSummaryLogsRepository = async (db, logger) => {
  await ensureCollection(db)

  return {
    insert: insert(db),
    update: update(db, logger),
    findById: findById(db),
    findLatestSubmittedForOrgReg: findLatestSubmittedForOrgReg(db),
    transitionToSubmittingExclusive: transitionToSubmittingExclusive(db)
  }
}

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

const COLLECTION_NAME = 'summary-logs'
const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000

const insert = (db) => async (id, summaryLog) => {
  const validatedId = validateId(id)
  const validatedSummaryLog = validateSummaryLogInsert(summaryLog)
  const { organisationId, registrationId } = validatedSummaryLog

  // Check for existing submitting log for same org/reg
  /** @type {any} */
  const submittingFilter = {
    organisationId,
    registrationId,
    status: 'submitting'
  }
  const existingSubmitting = await db
    .collection(COLLECTION_NAME)
    .findOne(submittingFilter)

  if (existingSubmitting) {
    throw Boom.conflict('A submission is in progress. Please wait.')
  }

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

const checkForSubmittingLog =
  (db) => async (organisationId, registrationId) => {
    /** @type {any} */
    const submittingFilter = {
      organisationId,
      registrationId,
      status: 'submitting'
    }
    const existingSubmitting = await db
      .collection(COLLECTION_NAME)
      .findOne(submittingFilter)

    if (existingSubmitting) {
      throw Boom.conflict('A submission is in progress. Please wait.')
    }
  }

const findLatestSubmittedForOrgReg =
  (db) => async (organisationId, registrationId) => {
    /** @type {any} */
    const filter = {
      organisationId,
      registrationId,
      status: 'submitted'
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

const transitionToSubmittingExclusive =
  (db, logger) => async (logId, version, organisationId, registrationId) => {
    const validatedId = validateId(logId)

    // First, verify the document exists and check its current state
    /** @type {any} */
    const findFilter = { _id: validatedId }
    const existing = await db.collection(COLLECTION_NAME).findOne(findFilter)

    if (!existing) {
      throw Boom.notFound(`Summary log with id ${validatedId} not found`)
    }

    if (existing.status !== 'validated') {
      throw Boom.conflict(
        `Summary log ${validatedId} is not in validated status`
      )
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

    // Check if another log for same org/reg is already submitting (fast path)
    /** @type {any} */
    const submittingFilter = {
      _id: { $ne: validatedId },
      organisationId,
      registrationId,
      status: 'submitting'
    }
    const existingSubmitting = await db
      .collection(COLLECTION_NAME)
      .findOne(submittingFilter)

    if (existingSubmitting) {
      return { success: false }
    }

    // Atomically transition to submitting with version check
    // The unique partial index on (organisationId, registrationId) where status='submitting'
    // ensures only one document can be in submitting status per org/reg at a time
    const submittedAt = new Date().toISOString()
    /** @type {any} */
    const updateFilter = { _id: validatedId, version, status: 'validated' }

    try {
      const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
        updateFilter,
        {
          $set: { status: 'submitting', submittedAt },
          $inc: { version: 1 }
        },
        { returnDocument: 'after' }
      )

      // If update failed due to version/status mismatch, another transaction beat us
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

const supersedePendingLogs =
  (db) => async (organisationId, registrationId, excludeId) => {
    /** @type {any} */
    const filter = {
      _id: { $ne: excludeId },
      organisationId,
      registrationId,
      status: { $in: ['preprocessing', 'validating', 'validated'] }
    }

    // Find all matching documents with their versions
    const docs = await db.collection(COLLECTION_NAME).find(filter).toArray()

    if (docs.length === 0) {
      return 0
    }

    // Build bulk operations with optimistic concurrency (version checking)
    const bulkOps = docs.map((doc) => ({
      updateOne: {
        filter: { _id: doc._id, version: doc.version },
        update: { $set: { status: 'superseded' }, $inc: { version: 1 } }
      }
    }))

    const result = await db.collection(COLLECTION_NAME).bulkWrite(bulkOps)
    return result.modifiedCount
  }

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {import('./port.js').SummaryLogsRepositoryFactory}
 */
export const createSummaryLogsRepository = (db) => (logger) => ({
  insert: insert(db),
  update: update(db, logger),
  findById: findById(db),
  supersedePendingLogs: supersedePendingLogs(db),
  checkForSubmittingLog: checkForSubmittingLog(db),
  findLatestSubmittedForOrgReg: findLatestSubmittedForOrgReg(db),
  transitionToSubmittingExclusive: transitionToSubmittingExclusive(db, logger)
})

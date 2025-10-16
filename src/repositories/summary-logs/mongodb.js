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

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {import('./port.js').SummaryLogsRepositoryFactory}
 */
export const createSummaryLogsRepository = (db) => (logger) => ({
  async insert(summaryLog) {
    const validated = validateSummaryLogInsert(summaryLog)
    const { id, ...rest } = validated

    try {
      await db
        .collection(COLLECTION_NAME)
        .insertOne({ _id: id, version: 1, ...rest })
    } catch (error) {
      if (error.code === MONGODB_DUPLICATE_KEY_ERROR_CODE) {
        throw Boom.conflict(`Summary log with id ${id} already exists`)
      }
      throw error
    }
  },

  async update(id, version, updates) {
    const validatedId = validateId(id)
    const validatedUpdates = validateSummaryLogUpdate(updates)

    const result = await db
      .collection(COLLECTION_NAME)
      .updateOne(
        { _id: validatedId, version },
        { $set: validatedUpdates, $inc: { version: 1 } }
      )

    if (result.matchedCount === 0) {
      const existing = await db
        .collection(COLLECTION_NAME)
        .findOne({ _id: validatedId })

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
  },

  async findById(id) {
    const validatedId = validateId(id)
    const doc = await db
      .collection(COLLECTION_NAME)
      .findOne({ _id: validatedId })
    if (!doc) {
      return null
    }
    const { _id, ...rest } = doc
    return { id: _id, ...rest }
  }
})

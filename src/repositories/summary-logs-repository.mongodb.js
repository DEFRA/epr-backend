import Boom from '@hapi/boom'
import {
  validateId,
  validateSummaryLogInsert
} from './summary-logs-repository.validation.js'

const COLLECTION_NAME = 'summary-logs'
const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000

/**
 * @returns {import('./summary-logs-repository.port.js').SummaryLogsRepository}
 */
export const createSummaryLogsRepository = (db) => ({
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

    const result = await db
      .collection(COLLECTION_NAME)
      .updateOne(
        { _id: validatedId, version },
        { $set: updates, $inc: { version: 1 } }
      )

    if (result.matchedCount === 0) {
      const existing = await db
        .collection(COLLECTION_NAME)
        .findOne({ _id: validatedId })

      if (!existing) {
        throw Boom.notFound(`Summary log with id ${validatedId} not found`)
      }

      throw Boom.conflict(
        `Version conflict: attempted to update with version ${version} but current version is ${existing.version}`
      )
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
  },

  async updateStatus(id, status) {
    const validatedId = validateId(id)
    const result = await db
      .collection(COLLECTION_NAME)
      .updateOne({ _id: validatedId }, { $set: { status } })

    if (result.matchedCount === 0) {
      throw Boom.notFound(`Summary log with id ${id} not found`)
    }
  }
})

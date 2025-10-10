import Boom from '@hapi/boom'
import {
  validateId,
  validateSummaryLogInsert
} from './summary-logs-repository.validation.js'

const COLLECTION_NAME = 'summary-logs'

/**
 * @returns {import('./summary-logs-repository.port.js').SummaryLogsRepository}
 */
export const createSummaryLogsRepository = (db) => ({
  async insert(summaryLog) {
    const validated = validateSummaryLogInsert(summaryLog)
    const { id, ...rest } = validated

    try {
      await db.collection(COLLECTION_NAME).insertOne({ _id: id, ...rest })
    } catch (error) {
      if (error.code === 11000) {
        throw Boom.conflict(`Summary log with id ${id} already exists`)
      }
      throw error
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

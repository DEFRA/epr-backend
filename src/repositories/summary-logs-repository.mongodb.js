import { validateSummaryLogInsert } from './summary-logs-repository.validation.js'

const COLLECTION_NAME = 'summary-logs'

/**
 * @returns {import('./summary-logs-repository.port.js').SummaryLogsRepository}
 */
export const createSummaryLogsRepository = (db) => ({
  async insert(summaryLog) {
    const validated = validateSummaryLogInsert(summaryLog)
    const { id, ...rest } = validated
    const result = await db
      .collection(COLLECTION_NAME)
      .insertOne({ _id: id, ...rest })
    return { insertedId: result.insertedId }
  },

  async findById(id) {
    const doc = await db.collection(COLLECTION_NAME).findOne({ _id: id })
    if (!doc) return null
    const { _id, ...rest } = doc
    return { id: _id, ...rest }
  }
})

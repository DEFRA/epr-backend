import { validateSummaryLogInsert } from './summary-logs-repository.validation.js'

const COLLECTION_NAME = 'summary-logs'

/**
 * @returns {import('./summary-logs-repository.port.js').SummaryLogsRepository}
 */
export const createSummaryLogsRepository = (db) => ({
  async insert(summaryLog) {
    const validated = validateSummaryLogInsert(summaryLog)
    return db.collection(COLLECTION_NAME).insertOne(validated)
  },

  async findBySummaryLogId(summaryLogId) {
    return db.collection(COLLECTION_NAME).findOne({ summaryLogId })
  }
})

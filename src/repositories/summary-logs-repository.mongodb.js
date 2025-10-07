import { validateSummaryLogInsert } from './summary-logs-repository.validation.js'

/**
 * @returns {import('./summary-logs-repository.port.js').SummaryLogsRepository}
 */
export const createSummaryLogsRepository = (db) => ({
  async insert(summaryLog) {
    const validated = validateSummaryLogInsert(summaryLog)
    return db.collection('summary-logs').insertOne(validated)
  },

  async findByFileId(fileId) {
    return db.collection('summary-logs').findOne({ fileId })
  },

  async findBySummaryLogId(summaryLogId) {
    return db.collection('summary-logs').findOne({ summaryLogId })
  }
})

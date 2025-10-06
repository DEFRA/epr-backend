/**
 * @returns {import('./summary-logs-repository.port.js').SummaryLogsRepository}
 */
export const createSummaryLogsRepository = (db) => ({
  async insert(summaryLog) {
    return db.collection('summary-logs').insertOne(summaryLog)
  },

  async findByFileId(fileId) {
    return db.collection('summary-logs').findOne({ fileId })
  }
})

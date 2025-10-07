/**
 * @typedef {Object} SummaryLogsRepository
 * @property {(summaryLog: Object) => Promise<{insertedId: string}>} insert
 * @property {(fileId: string) => Promise<Object|null>} findByFileId
 * @property {(summaryLogId: string) => Promise<Object|null>} findBySummaryLogId
 */

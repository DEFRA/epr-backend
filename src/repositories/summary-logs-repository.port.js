/**
 * @typedef {Object} SummaryLogsRepository
 * @property {(summaryLog: Object) => Promise<{insertedId: string}>} insert
 * @property {(summaryLogId: string) => Promise<Object|null>} findBySummaryLogId
 */

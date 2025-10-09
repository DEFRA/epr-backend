/**
 * @typedef {Object} SummaryLogsRepository
 * @property {(summaryLog: Object) => Promise<{insertedId: string}>} insert
 * @property {(id: string) => Promise<Object|null>} findById
 */

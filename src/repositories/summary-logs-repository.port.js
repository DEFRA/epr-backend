/**
 * @typedef {Object} SummaryLogsRepository
 * @property {(summaryLog: Object) => Promise<void>} insert
 * @property {(id: string) => Promise<Object|null>} findById
 * @property {(id: string, status: string) => Promise<void>} updateStatus
 */

/**
 * @typedef {Object} SummaryLogWithVersion
 * @property {number} version
 * @property {Object} summaryLog
 */

/**
 * @typedef {Object} SummaryLogsRepository
 * @property {(id: string, summaryLog: Object) => Promise<void>} insert
 * @property {(id: string, version: number, summaryLog: Object) => Promise<void>} update
 * @property {(id: string) => Promise<SummaryLogWithVersion|null>} findById
 */

/**
 * @typedef {(logger: import('#common/helpers/logging/logger.js').TypedLogger) => SummaryLogsRepository} SummaryLogsRepositoryFactory
 */

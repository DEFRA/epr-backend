/**
 * @typedef {Object} SummaryLogVersion
 * @property {number} version
 * @property {Object} summaryLog
 */

/**
 * @typedef {Object} SummaryLogsRepository
 * @property {(id: string, summaryLog: Object) => Promise<void>} insert - Inserts a new summary log. Throws 409 Conflict if a summary log with 'submitting' status already exists for the same organisationId/registrationId pair.
 * @property {(id: string, version: number, summaryLog: Object) => Promise<void>} update
 * @property {(id: string) => Promise<SummaryLogVersion|null>} findById
 * @property {(organisationId: string, registrationId: string, excludeId: string) => Promise<number>} supersedePendingLogs
 */

/**
 * @typedef {(logger: import('#common/helpers/logging/logger.js').TypedLogger) => SummaryLogsRepository} SummaryLogsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

/**
 * @typedef {Object} SummaryLogVersion
 * @property {number} version
 * @property {Object} summaryLog
 */

/**
 * @typedef {Object} SummaryLogsRepository
 * @property {(id: string, summaryLog: Object) => Promise<void>} insert
 * @property {(id: string, version: number, summaryLog: Object) => Promise<void>} update
 * @property {(id: string) => Promise<SummaryLogVersion|null>} findById
 * @property {(organisationId: string, registrationId: string) => Promise<boolean>} hasSubmittingLog
 * @property {(organisationId: string, registrationId: string, excludeId: string) => Promise<number>} supersedePendingLogs
 * @property {(organisationId: string, registrationId: string, excludeId: string) => Promise<boolean>} hasNewerValidatedLog
 */

/**
 * @typedef {(logger: import('#common/helpers/logging/logger.js').TypedLogger) => SummaryLogsRepository} SummaryLogsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

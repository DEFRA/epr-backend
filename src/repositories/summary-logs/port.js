/**
 * @typedef {Object} SummaryLogVersion
 * @property {number} version
 * @property {Object} summaryLog
 */

/**
 * @typedef {Object} SummaryLogWithId
 * @property {string} id
 * @property {number} version
 * @property {Object} summaryLog
 */

/**
 * @typedef {Object} TransitionResult
 * @property {boolean} success
 * @property {Object} [summaryLog]
 * @property {number} [version]
 */

/**
 * @typedef {Object} SummaryLogsRepository
 * @property {(id: string, summaryLog: Object) => Promise<void>} insert
 * @property {(id: string, version: number, summaryLog: Object) => Promise<void>} update
 * @property {(id: string) => Promise<SummaryLogVersion|null>} findById
 * @property {(organisationId: string, registrationId: string, excludeId: string) => Promise<number>} supersedePendingLogs
 * @property {(organisationId: string, registrationId: string) => Promise<void>} checkForSubmittingLog - Throws 409 if a submitting log exists for org/reg
 * @property {(organisationId: string, registrationId: string) => Promise<SummaryLogWithId|null>} findLatestSubmittedForOrgReg
 * @property {(logId: string, version: number, organisationId: string, registrationId: string) => Promise<TransitionResult>} transitionToSubmittingExclusive
 */

/**
 * @typedef {(logger: import('#common/helpers/logging/logger.js').TypedLogger) => SummaryLogsRepository} SummaryLogsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

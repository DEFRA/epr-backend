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
 * @typedef {Object} SummaryLogStats
 * @property {string} organisationId - Organisation ID
 * @property {string} registrationId - Registration ID
 * @property {Date|null} lastSuccessful - Date of last submitted log
 * @property {Date|null} lastFailed - Date of last failed log
 * @property {number} successfulCount - Count of submitted logs
 * @property {number} failedCount - Count of failed logs
 */

/**
 * @typedef {Object} DownloadUrlResult
 * @property {string} url - The download URL
 * @property {string} expiresAt - ISO 8601 timestamp when the URL expires
 */

/**
 * @typedef {Object} SummaryLogsRepository
 * @property {(id: string, summaryLog: Object) => Promise<void>} insert
 * @property {(id: string, version: number, summaryLog: Object) => Promise<void>} update
 * @property {(id: string) => Promise<SummaryLogVersion|null>} findById
 * @property {(organisationId: string, registrationId: string) => Promise<SummaryLogWithId|null>} findLatestSubmittedForOrgReg
 * @property {() => Promise<SummaryLogStats[]>} findAllSummaryLogStatsByRegistrationId
 * @property {(logId: string) => Promise<TransitionResult>} transitionToSubmittingExclusive
 * @property {(summaryLogId: string) => Promise<DownloadUrlResult>} getDownloadUrl
 */

/**
 * @typedef {(logger: import('#common/helpers/logging/logger.js').TypedLogger) => SummaryLogsRepository} SummaryLogsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

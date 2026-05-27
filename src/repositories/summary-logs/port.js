/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {SummaryLog} from '#domain/summary-logs/model.js' */

/**
 * @typedef {Object} SummaryLogVersion
 * @property {number} version
 * @property {SummaryLog} summaryLog
 */

/**
 * @typedef {Object} SummaryLogWithId
 * @property {string} id
 * @property {number} version
 * @property {SummaryLog} summaryLog
 */

/**
 * @typedef {
 *   | { success: false }
 *   | { success: true, summaryLog: SummaryLog, version: number }
 * } TransitionResult
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
 * @property {(id: string, summaryLog: SummaryLog) => Promise<void>} insert
 * @property {(id: string, version: number, summaryLog: Partial<SummaryLog>) => Promise<void>} update
 * @property {(id: string) => Promise<SummaryLogVersion|null>} findById
 * @property {(organisationId: string, registrationId: string) => Promise<SummaryLogWithId|null>} findLatestSubmittedForOrgReg
 * @property {(organisationId: string, registrationId: string) => Promise<SummaryLogWithId[]>} findAllByOrgReg
 * @property {() => Promise<SummaryLogStats[]>} findAllSummaryLogStatsByRegistrationId
 * @property {(logId: string) => Promise<TransitionResult>} transitionToSubmittingExclusive
 * @property {(summaryLogId: string) => Promise<DownloadUrlResult>} getDownloadUrl
 */

/**
 * @typedef {(logger: TypedLogger) => SummaryLogsRepository} SummaryLogsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

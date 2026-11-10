/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {Year} from '#common/helpers/dates/year.js' */
/** @import {SummaryLog} from '#domain/summary-logs/model.js' */
/** @import {AccreditationNumber, OrganisationNumber, RegistrationNumber} from '#domain/organisations/numbers.js' */
/** @import {SummaryLogKey} from '#domain/summary-logs/numbers.js' */
/** @import {SummaryLogFileId, SummaryLogId} from '#domain/summary-logs/ids.js' */

/**
 * @typedef {Object} SummaryLogVersion
 * @property {number} version
 * @property {SummaryLog} summaryLog
 */

/**
 * @typedef {Object} SummaryLogWithId
 * @property {SummaryLogId} id
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
 * @property {OrganisationNumber} organisationNumber
 * @property {RegistrationNumber} registrationNumber
 * @property {Date|null} lastSuccessful - Date of last submitted log
 * @property {Date|null} lastFailed - Date of last failed log
 * @property {number} successfulCount - Count of submitted logs
 * @property {number} failedCount - Count of failed logs
 */

/**
 * A summary log named by its organisation, registration and accreditation
 * numbers in place of their database ids. The accreditation number is absent
 * when the summary log was stored before its accreditation was recorded.
 *
 * @typedef {Omit<SummaryLog, 'organisationId' | 'registrationId' | 'accreditationId'> & {
 *   organisationNumber: OrganisationNumber,
 *   registrationNumber: RegistrationNumber,
 *   accreditationNumber?: AccreditationNumber | null
 * }} KeyedSummaryLog
 */

/**
 * @typedef {Object} KeyedSummaryLogWithId
 * @property {SummaryLogId} id
 * @property {number} version
 * @property {KeyedSummaryLog} summaryLog
 */

/**
 * @typedef {Object} DownloadUrlResult
 * @property {string} url - The download URL
 * @property {string} expiresAt - ISO 8601 timestamp when the URL expires
 */

/**
 * The fields a summary log stored before summary logs were scoped by
 * accreditation and year may lack. An accreditation is given by its id and
 * number together, both `null` for a registered-only registration.
 *
 * @typedef {(
 *   | { accreditationId: string, accreditationNumber: AccreditationNumber }
 *   | { accreditationId: null, accreditationNumber: null }
 *   | { accreditationId?: never, accreditationNumber?: never }
 * ) & { year?: Year }} SummaryLogScope
 */

/**
 * @typedef {Object} SummaryLogsRepository
 * @property {(id: SummaryLogId, summaryLog: SummaryLog) => Promise<void>} insert
 * @property {(id: SummaryLogId, version: number, summaryLog: Partial<SummaryLog>) => Promise<void>} update
 * @property {(id: SummaryLogId) => Promise<SummaryLogVersion|null>} findById
 * @property {(fileId: SummaryLogFileId) => Promise<SummaryLogVersion|null>} findByFileId - The summary log holding the uploaded file, whose id is the one the waste balance ledger records
 * @property {() => Promise<SummaryLogId[]>} findIdsWithoutScope - ids of summary logs lacking an accreditation number or a year
 * @property {(id: SummaryLogId, version: number, scope: SummaryLogScope) => Promise<void>} assignScope - writes the scope a summary log lacks, refusing to overwrite a field it holds
 * @property {(key: SummaryLogKey) => Promise<KeyedSummaryLogWithId|null>} findLatestSubmitted - The latest submitted, in the key's year when it names one
 * @property {(key: SummaryLogKey) => Promise<KeyedSummaryLogWithId[]>} findAll - Submitted and failed summary logs, newest upload first
 * @property {() => Promise<SummaryLogStats[]>} findAllSummaryLogStatsByRegistration
 * @property {(logId: SummaryLogId) => Promise<TransitionResult>} transitionToSubmittingExclusive
 * @property {(summaryLogId: SummaryLogId, registrationNumber?: RegistrationNumber) => Promise<DownloadUrlResult>} getDownloadUrl
 * @property {(fileId: SummaryLogFileId, registrationNumber?: RegistrationNumber) => Promise<DownloadUrlResult>} getDownloadUrlByFileId
 */

/**
 * @typedef {(logger: TypedLogger) => SummaryLogsRepository} SummaryLogsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

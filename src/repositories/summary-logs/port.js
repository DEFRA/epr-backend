/** @import {TypedLogger} from '#common/helpers/logging/logger.js' */
/** @import {SummaryLog} from '#domain/summary-logs/model.js' */
/** @import {AccreditationNumber, OrganisationNumber, RegistrationNumber} from '#domain/organisations/numbers.js' */
/** @import {SummaryLogKey} from '#domain/summary-logs/numbers.js' */
/** @import {SummaryLogFileId, SummaryLogId} from '#domain/summary-logs/ids.js' */

/**
 * A summary log as an upload stores it, holding the database id of the
 * accreditation it was uploaded for beside its number.
 *
 * @typedef {SummaryLog & { accreditationId: string | null }} NewSummaryLog
 */

/**
 * A summary log document as the collection may hold it, before it is read
 * into one of the shapes the domain declares.
 *
 * @typedef {Omit<SummaryLog, 'accreditationNumber'> & {
 *   accreditationId?: string | null,
 *   accreditationNumber?: AccreditationNumber | null
 * }} StoredSummaryLog
 */

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
 * A summary log named by its organisation and registration numbers in place
 * of their database ids.
 *
 * @typedef {Omit<SummaryLog, 'organisationId' | 'registrationId'> & {
 *   organisationNumber: OrganisationNumber,
 *   registrationNumber: RegistrationNumber
 * }} KeyedSummaryLog
 */

/**
 * @typedef {Object} KeyedSummaryLogWithId
 * @property {SummaryLogId} id
 * @property {number} version
 * @property {KeyedSummaryLog} summaryLog
 */

/**
 * A submitted summary log, which always holds when it was submitted.
 *
 * @typedef {KeyedSummaryLog & { submittedAt: string }} KeyedSubmittedSummaryLog
 */

/**
 * @typedef {Object} KeyedSubmittedSummaryLogWithId
 * @property {SummaryLogId} id
 * @property {number} version
 * @property {KeyedSubmittedSummaryLog} summaryLog
 */

/**
 * @typedef {Object} DownloadUrlResult
 * @property {string} url - The download URL
 * @property {string} expiresAt - ISO 8601 timestamp when the URL expires
 * @property {AccreditationNumber | null} accreditationNumber - The summary log's accreditation, null when it is registered-only
 */

/**
 * @typedef {Object} SummaryLogsRepository
 * @property {(id: SummaryLogId, summaryLog: NewSummaryLog) => Promise<void>} insert
 * @property {(id: SummaryLogId, version: number, summaryLog: Partial<SummaryLog>) => Promise<void>} update
 * @property {(id: SummaryLogId) => Promise<SummaryLogVersion|null>} findById
 * @property {(fileId: SummaryLogFileId) => Promise<SummaryLogVersion|null>} findByFileId - The summary log holding the uploaded file, whose id is the one the waste balance ledger records
 * @property {(key: SummaryLogKey) => Promise<KeyedSubmittedSummaryLogWithId|null>} findLatestSubmitted - The latest submitted, in the key's year when it names one
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

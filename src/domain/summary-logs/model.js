/**
 * @typedef {Object} FileUpload
 * @property {string} id
 * @property {string} name
 * @property {'pending'|'rejected'} status
 */

/**
 * @typedef {Object} StoredFile
 * @property {string} id
 * @property {string} name
 * @property {'complete'} status
 * @property {string} uri - S3 URI (e.g., s3://bucket/key)
 */

/**
 * @typedef {FileUpload | StoredFile} SummaryLogFile
 */

/**
 * @typedef {Object} ValidationIssue
 * @property {string} severity - One of: FATAL, ERROR, WARNING
 * @property {string} category - One of: parsing, technical, business
 * @property {string} message - Human-readable description
 * @property {string} [code] - Error code for i18n
 * @property {Object} [context] - Additional context
 */

/**
 * @typedef {Object} Validation
 * @property {ValidationIssue[]} [issues] - Validation issues found during processing
 * @property {Array<{code: string, [k: string]: unknown}>} [failures] - Failure codes from upload rejection
 * @property {number} [totalIssuesCount] - Total number of validation issues found (may exceed issues.length when capped for storage)
 */

/** @import {Loads, LoadsByWasteRecordType} from '#application/summary-logs/load-counts.js' */
/** @import {ProcessingType} from './meta-fields.js' */
/** @import {SummaryLogStatus} from './status.js' */

/**
 * Metadata extracted from the summary log spreadsheet's Cover sheet.
 * All fields are optional because extraction emits only the keys that were
 * present in the parsed file — a missing cell yields a missing field.
 *
 * @typedef {{
 *   PROCESSING_TYPE?: ProcessingType,
 *   TEMPLATE_VERSION?: number,
 *   MATERIAL?: string,
 *   ACCREDITATION_NUMBER?: string,
 *   REGISTRATION_NUMBER?: string
 * }} SummaryLogMeta
 */

/**
 * @typedef {{
 *   createdAt?: string,
 *   expiresAt?: Date | null,
 *   file: SummaryLogFile,
 *   loads?: Loads,
 *   loadsByWasteRecordType?: LoadsByWasteRecordType,
 *   meta?: SummaryLogMeta,
 *   organisationId?: string,
 *   registrationId?: string,
 *   status: SummaryLogStatus,
 *   submittedAt?: string,
 *   validation?: Validation
 * }} SummaryLog
 */

/** @typedef {Omit<SummaryLog, 'file'> & { file: StoredFile }} StoredSummaryLog */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

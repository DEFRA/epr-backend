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
 * @property {number} [totalIssuesCount] - Total number of validation issues found (may exceed issues.length when capped for storage)
 */

/** @import {ProcessingType} from './meta-fields.js' */

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
 * @typedef {Object} SummaryLog
 * @property {import('./status.js').SummaryLogStatus} status
 * @property {SummaryLogFile} file
 * @property {Validation} [validation]
 * @property {string} [organisationId]
 * @property {string} [registrationId]
 * @property {SummaryLogMeta} [meta]
 * @property {import('#application/summary-logs/load-counts.js').Loads} [loads]
 * @property {import('#application/summary-logs/load-counts.js').LoadsByWasteRecordType} [loadsByWasteRecordType]
 */

/**
 * @typedef {Object} StoredSummaryLog
 * @property {import('./status.js').SummaryLogStatus} status
 * @property {StoredFile} file
 * @property {Validation} [validation]
 * @property {string} [organisationId]
 * @property {string} [registrationId]
 * @property {SummaryLogMeta} [meta]
 * @property {import('#application/summary-logs/load-counts.js').Loads} [loads]
 * @property {import('#application/summary-logs/load-counts.js').LoadsByWasteRecordType} [loadsByWasteRecordType]
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

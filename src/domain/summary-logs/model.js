/**
 * @typedef {Object} S3Location
 * @property {string} bucket
 * @property {string} key
 */

/**
 * @typedef {Object} SummaryLogFile
 * @property {string} id
 * @property {string} name
 * @property {'complete'|'pending'|'rejected'} [status]
 * @property {S3Location} [s3]
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
 */

/**
 * @typedef {Object} SummaryLog
 * @property {import('./status.js').SummaryLogStatus} status
 * @property {SummaryLogFile} file
 * @property {string} [failureReason]
 * @property {Validation} [validation]
 * @property {string} [organisationId]
 * @property {string} [registrationId]
 */

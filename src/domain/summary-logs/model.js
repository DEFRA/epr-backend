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

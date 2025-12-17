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
 * @typedef {Object.<string, string>} SummaryLogMeta
 * Metadata extracted from the summary log spreadsheet (e.g. PROCESSING_TYPE, MATERIAL)
 */

/**
 * @typedef {Object} SummaryLog
 * @property {import('./status.js').SummaryLogStatus} status
 * @property {SummaryLogFile} file
 * @property {Validation} [validation]
 * @property {string} [organisationId]
 * @property {string} [registrationId]
 * @property {SummaryLogMeta} [meta]
 */

/**
 * @typedef {Object} StoredSummaryLog
 * @property {import('./status.js').SummaryLogStatus} status
 * @property {StoredFile} file
 * @property {Validation} [validation]
 * @property {string} [organisationId]
 * @property {string} [registrationId]
 * @property {SummaryLogMeta} [meta]
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

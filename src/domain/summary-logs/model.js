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
 * @typedef {Object} SummaryLog
 * @property {import('./status.js').SummaryLogStatus} status
 * @property {SummaryLogFile} file
 * @property {string} [failureReason]
 * @property {string} [organisationId]
 * @property {string} [registrationId]
 */

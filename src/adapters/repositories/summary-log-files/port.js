/**
 * @typedef {Object} PresignedUrlResult
 * @property {string} url - The pre-signed URL for downloading the file
 * @property {string} expiresAt - ISO 8601 timestamp when the URL expires
 */

/**
 * @typedef {Object} SummaryLogFilesRepository
 * @property {(s3Uri: string) => Promise<PresignedUrlResult>} getDownloadUrl
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

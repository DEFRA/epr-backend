/**
 * @typedef {Object} InitiateSummaryLogUploadOptions
 * @property {string} organisationId - Organisation ID
 * @property {string} registrationId - Registration ID
 * @property {string} summaryLogId - Summary log ID (for callback and redirect)
 */

/**
 * @typedef {Object} InitiateUploadResponse
 * @property {string} uploadId - CDP Uploader upload ID
 * @property {string} uploadUrl - URL for uploading the file
 * @property {string} statusUrl - URL for checking upload status
 */

/**
 * @typedef {Object} UploadsRepository
 * @property {(location: string) => Promise<Buffer|null>} findByLocation
 * @property {(options: InitiateSummaryLogUploadOptions) => Promise<InitiateUploadResponse>} initiateSummaryLogUpload
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

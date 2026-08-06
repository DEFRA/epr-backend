/**
 * @typedef {Object} PresignedUrlResult
 * @property {string} url - The pre-signed URL
 * @property {string} expiresAt - ISO 8601 timestamp when the URL expires
 */

/**
 * @typedef {Object} PublicRegisterRepository
 * @property {(fileName: string, csv: string) => Promise<void>} save - Save CSV data to storage
 * @property {(url: string) => Promise<string>} fetchFromPresignedUrl - Fetch CSV data from a pre-signed URL
 * @property {(fileName: string) => Promise<PresignedUrlResult>} generatePresignedUrl - Generate a pre-signed URL for accessing the file
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import

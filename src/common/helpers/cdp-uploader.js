import { fetchJson } from './fetch-json.js'

/**
 * Initiate a file upload with CDP Uploader
 * @param {string} cdpUploaderUrl - Base URL of the CDP Uploader service
 * @param {Object} options - Upload options
 * @param {string} options.redirect - Relative URL for post-upload redirect
 * @param {string} options.callback - Callback URL for upload completion
 * @param {string} options.s3Bucket - Target S3 bucket
 * @param {string} [options.s3Path] - Optional path prefix within bucket
 * @param {string[]} options.mimeTypes - Allowed MIME types
 * @param {number} [options.maxFileSize] - Maximum file size in bytes
 * @param {Object} [options.metadata] - Metadata to pass through callback
 * @returns {Promise<{uploadId: string, uploadUrl: string, statusUrl: string}>}
 */
export const initiateCdpUpload = async (cdpUploaderUrl, options) => {
  return fetchJson(`${cdpUploaderUrl}/initiate`, {
    method: 'POST',
    body: JSON.stringify(options)
  })
}

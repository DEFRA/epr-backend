import { fetchJson } from '#common/helpers/fetch-json.js'

/**
 * CDP Uploader upload status values.
 * @see https://github.com/DEFRA/cdp-uploader
 */
export const CDP_UPLOAD_STATUS = Object.freeze({
  PENDING: 'pending',
  READY: 'ready'
})

/**
 * CDP Uploader file status values.
 * @see https://github.com/DEFRA/cdp-uploader
 */
export const CDP_FILE_STATUS = Object.freeze({
  COMPLETE: 'complete',
  REJECTED: 'rejected'
})

/**
 * @typedef {Object} CdpUploadStatusResponse
 * @property {'pending' | 'ready'} uploadStatus
 * @property {Object} [form]
 * @property {number} [numberOfRejectedFiles]
 */

/**
 * @typedef {Object} CdpUploader
 * @property {(uploadId: string) => Promise<CdpUploadStatusResponse | null>} getUploadStatus
 */

/**
 * Creates a CDP Uploader adapter for interacting with the CDP Uploader service.
 *
 * @param {Object} options
 * @param {string} options.cdpUploaderUrl - CDP Uploader service URL
 * @param {Object} options.logger - Logger instance
 * @returns {CdpUploader}
 */
export const createCdpUploader = ({ cdpUploaderUrl, logger }) => ({
  /**
   * Fetches the upload status from CDP Uploader.
   *
   * @param {string} uploadId - The CDP upload ID
   * @returns {Promise<CdpUploadStatusResponse | null>} The upload status, or null if unavailable
   */
  async getUploadStatus(uploadId) {
    try {
      return await fetchJson(`${cdpUploaderUrl}/status/${uploadId}`)
    } catch (err) {
      logger.warn({
        error: err,
        message: 'CDP Uploader status check failed',
        uploadId
      })
      return null
    }
  }
})

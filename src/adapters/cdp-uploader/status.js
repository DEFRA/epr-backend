import { fetchJson } from '#common/helpers/fetch-json.js'

/**
 * Grace period before checking CDP Uploader status (in milliseconds).
 * The CDP callback should arrive within this window in normal operation.
 * We only check CDP directly if we're still stuck in PREPROCESSING after this period.
 */
const GRACE_PERIOD_MS = 30_000

/**
 * CDP Uploader upload status values.
 * @see https://github.com/DEFRA/cdp-uploader
 */
export const CDP_UPLOAD_STATUS = Object.freeze({
  INITIATED: 'initiated',
  PENDING: 'pending',
  READY: 'ready'
})

/**
 * CDP Uploader file status values.
 * @see https://github.com/DEFRA/cdp-uploader
 */
export const CDP_FILE_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETE: 'complete',
  REJECTED: 'rejected'
})

/**
 * @typedef {Object} CdpUploadStatusResponse
 * @property {'initiated' | 'pending' | 'ready'} uploadStatus
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
export const createCdpUploader = ({ cdpUploaderUrl, logger }) => {
  /**
   * Tracks when we first saw each uploadId.
   * Used to enforce grace period before checking CDP.
   * @type {Map<string, number>}
   */
  const firstSeenAt = new Map()

  return {
    /**
     * Fetches the upload status from CDP Uploader.
     *
     * Uses a grace period strategy: we don't check CDP for the first 30 seconds
     * because the callback should arrive in normal operation. After that, we
     * check directly every time - if we're past the grace period, something
     * may be wrong and we need to know.
     *
     * @param {string} uploadId - The CDP upload ID
     * @returns {Promise<CdpUploadStatusResponse | null>} The upload status, or null if unavailable
     */
    async getUploadStatus(uploadId) {
      const now = Date.now()

      // Track first time we see this uploadId
      if (!firstSeenAt.has(uploadId)) {
        firstSeenAt.set(uploadId, now)
      }

      const firstSeen = firstSeenAt.get(uploadId)

      // Within grace period - don't bother checking CDP yet
      if (now - firstSeen < GRACE_PERIOD_MS) {
        return null
      }

      // Past grace period - check CDP directly (no caching)
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
  }
}

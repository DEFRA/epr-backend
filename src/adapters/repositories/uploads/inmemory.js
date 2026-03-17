import { randomUUID } from 'node:crypto'

/**
 * @typedef {import('#domain/uploads/repository/port.js').InitiateSummaryLogUploadOptions} InitiateSummaryLogUploadOptions
 */

/**
 * @typedef {Object} PendingUpload
 * @property {string} uploadId
 * @property {InitiateSummaryLogUploadOptions | InitiateOrsImportOptions} options
 */

/**
 * @typedef {import('#domain/uploads/repository/port.js').InitiateOrsImportOptions} InitiateOrsImportOptions
 */

/**
 * Creates an in-memory uploads repository for testing.
 *
 * @param {{ s3Bucket?: string }} [config] - Optional configuration
 * @returns {import('#domain/uploads/repository/port.js').UploadsRepository & {
 *   completeUpload: (uploadId: string, buffer: Buffer) => Promise<{ s3Uri: string }>,
 *   initiateCalls: InitiateSummaryLogUploadOptions[],
 *   orsInitiateCalls: InitiateOrsImportOptions[],
 *   nextOrsImportError: Error | null
 * }}
 */
export const createInMemoryUploadsRepository = (config = {}) => {
  const s3Bucket = config.s3Bucket ?? 'test-bucket'

  /** @type {Map<string, Buffer>} */
  const storage = new Map()

  /** @type {Map<string, PendingUpload>} */
  const pendingUploads = new Map()

  /** @type {InitiateSummaryLogUploadOptions[]} */
  const initiateCalls = []

  /** @type {InitiateOrsImportOptions[]} */
  const orsInitiateCalls = []

  return {
    initiateCalls,
    orsInitiateCalls,

    /** @type {Error | null} */
    nextOrsImportError: null,

    async findByLocation(uri) {
      return storage.get(uri) ?? null
    },

    async deleteByLocation(uri) {
      storage.delete(uri)
    },

    async initiateSummaryLogUpload(options) {
      initiateCalls.push(options)

      const uploadId = randomUUID()

      pendingUploads.set(uploadId, { uploadId, options })

      return {
        uploadId,
        uploadUrl: `https://cdp-uploader.test/upload-and-scan/${uploadId}`,
        statusUrl: `https://cdp-uploader.test/status/${uploadId}`
      }
    },

    async initiateOrsImport({ importId, redirectUrl, callbackUrl }) {
      if (this.nextOrsImportError) {
        const error = this.nextOrsImportError
        this.nextOrsImportError = null
        throw error
      }

      orsInitiateCalls.push({ importId, redirectUrl, callbackUrl })

      const uploadId = randomUUID()

      pendingUploads.set(uploadId, {
        uploadId,
        options: { importId, redirectUrl, callbackUrl }
      })

      return {
        uploadId,
        uploadUrl: `https://cdp-uploader.test/upload-and-scan/${uploadId}`,
        statusUrl: `https://cdp-uploader.test/status/${uploadId}`
      }
    },

    async completeUpload(uploadId, buffer) {
      const pending = pendingUploads.get(uploadId)

      if (!pending) {
        throw new Error(`No pending upload found for uploadId: ${uploadId}`)
      }

      const /** @type {InitiateSummaryLogUploadOptions} */ options =
          /** @type {InitiateSummaryLogUploadOptions} */ (pending.options)
      const { organisationId, registrationId, callbackUrl } = options
      const s3Key = `organisations/${organisationId}/registrations/${registrationId}/${uploadId}.xlsx`
      const s3Uri = `s3://${s3Bucket}/${s3Key}`

      storage.set(s3Uri, buffer)
      pendingUploads.delete(uploadId)

      const payload = {
        form: {
          file: {
            fileId: randomUUID(),
            filename: 'summary-log.xlsx',
            fileStatus: 'complete',
            s3Bucket,
            s3Key
          }
        }
      }

      await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      return { s3Uri }
    }
  }
}

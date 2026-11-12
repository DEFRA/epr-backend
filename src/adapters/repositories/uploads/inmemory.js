import { randomUUID } from 'node:crypto'

import { summaryLogUploadPath } from '#domain/uploads/upload-locations.js'
import { parseUploadUri } from './s3-uri.js'

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
 * Calls back the way CDP Uploader does once a file is scanned and stored.
 *
 * @param {string} callbackUrl
 * @param {Record<string, string>} metadata
 * @param {{ s3Bucket: string, s3Key: string }} location
 */
const postCompletedCallback = async (
  callbackUrl,
  metadata,
  { s3Bucket, s3Key }
) => {
  await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      metadata,
      form: {
        file: {
          fileId: randomUUID(),
          filename: 'summary-log.xlsx',
          fileStatus: 'complete',
          s3Bucket,
          s3Key
        }
      }
    })
  })
}

/**
 * Creates an in-memory uploads repository for testing.
 *
 * @param {{ orsBucket?: string, summaryLogsBucket?: string }} [config] - Optional configuration
 * @returns {import('#domain/uploads/repository/port.js').UploadsRepository & {
 *   completeUpload: (uploadId: string, buffer: Buffer) => Promise<{ s3Uri: string }>,
 *   initiateCalls: InitiateSummaryLogUploadOptions[],
 *   orsInitiateCalls: InitiateOrsImportOptions[]
 * }}
 */
export const createInMemoryUploadsRepository = (config = {}) => {
  const summaryLogsBucket = config.summaryLogsBucket ?? 're-ex-summary-logs'
  const uploadBuckets = [
    summaryLogsBucket,
    config.orsBucket ?? 're-ex-overseas-sites'
  ]

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

    async findByLocation(uri) {
      parseUploadUri(uri, uploadBuckets)
      return storage.get(uri) ?? null
    },

    async deleteByLocation(uri) {
      parseUploadUri(uri, uploadBuckets)
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

    async initiateOrsImport(options) {
      orsInitiateCalls.push(options)

      const uploadId = randomUUID()

      pendingUploads.set(uploadId, { uploadId, options })

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
      const { organisationId, registrationId, summaryLogId, callback } = options
      const s3Key = `${summaryLogUploadPath({ organisationId, registrationId })}/${uploadId}.xlsx`
      const s3Uri = `s3://${summaryLogsBucket}/${s3Key}`

      storage.set(s3Uri, buffer)
      pendingUploads.delete(uploadId)

      await postCompletedCallback(
        callback.url,
        { summaryLogId, signature: callback.signature },
        { s3Bucket: summaryLogsBucket, s3Key }
      )

      return { s3Uri }
    }
  }
}

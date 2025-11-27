import { randomUUID } from 'node:crypto'

/**
 * @typedef {import('#domain/uploads/repository/port.js').InitiateSummaryLogUploadOptions} InitiateSummaryLogUploadOptions
 */

/**
 * Creates an in-memory uploads repository for testing.
 * Files can be added using the put method.
 * Upload initiations are tracked in the initiateCalls array.
 *
 * @param {Map<string, Buffer>} [initialData] - Optional initial data as a Map where keys are S3 URIs and values are Buffers
 * @returns {import('#domain/uploads/repository/port.js').UploadsRepository & { put: (uri: string, content: Buffer) => void, initiateCalls: InitiateSummaryLogUploadOptions[] }}
 */
export const createInMemoryUploadsRepository = (initialData = new Map()) => {
  const storage = new Map(initialData)
  /** @type {InitiateSummaryLogUploadOptions[]} */
  const initiateCalls = []

  return {
    initiateCalls,

    async findByLocation(uri) {
      return storage.get(uri) ?? null
    },

    put(uri, content) {
      storage.set(uri, content)
    },

    async initiateSummaryLogUpload(options) {
      initiateCalls.push(options)

      const uploadId = randomUUID()

      return {
        uploadId,
        uploadUrl: `/upload-and-scan/${uploadId}`,
        statusUrl: `https://cdp-uploader.test/status/${uploadId}`
      }
    }
  }
}

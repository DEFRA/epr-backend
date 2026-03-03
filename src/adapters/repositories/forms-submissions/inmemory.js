import { Readable } from 'node:stream'

/**
 * @typedef {Object} InMemoryFormsFileUploadsRepositoryConfig
 * @property {Map<string, Buffer>} [initialFiles] - Map of fileId to file content for initial load
 */

/**
 * Creates an in-memory Forms File Uploads Repository for testing
 *
 * @param {InMemoryFormsFileUploadsRepositoryConfig} [config={}]
 * @returns {Object} Repository with file operations
 */
export const createInMemoryFormsFileUploadsRepository = (config = {}) => {
  // Initialize storage with provided files or empty Map
  const storage = new Map(config.initialFiles || [])

  return {
    /**
     * Copy file from Forms Submission API to S3
     *
     * @param {Object} params
     * @param {string} params.fileId - File ID from Forms Submission API (used as S3 key)
     * @param {import('#domain/organisations/model.js').RegulatorValue} params.regulator - Regulator code (EA, NIEA, NRW, SEPA)
     * @returns {Promise<void>}
     */
    async copyFormFileToS3({ fileId, regulator }) {
      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Store mock file content with metadata
      const mockContent = Buffer.from(
        JSON.stringify({
          fileId,
          regulator,
          copiedAt: new Date().toISOString(),
          content: `Mock file content for ${fileId} from ${regulator}`
        })
      )

      storage.set(fileId, mockContent)
    },

    /**
     * Get file from storage by file ID
     *
     * @param {string} fileId - File ID (S3 key)
     * @returns {Promise<import('stream').Readable>} File content as readable stream
     */
    async getFileById(fileId) {
      const fileContent = storage.get(fileId)

      if (!fileContent) {
        const error = new Error(`File not found: ${fileId}`)
        error.name = 'NoSuchKey'
        throw error
      }

      // Convert Buffer to Readable stream (matching S3 SDK response)
      return Readable.from(fileContent)
    }
  }
}

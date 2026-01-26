/**
 * @typedef {Object} InMemoryPublicRegisterRepositoryConfig
 * @property {string} [s3Bucket] - S3 bucket name (for URL generation)
 * @property {number} [preSignedUrlExpiry] - Expiry time for pre-signed URLs in seconds
 */

/** @typedef {import('#domain/public-register/repository/port.js').PresignedUrlResult} PresignedUrlResult */

/**
 * Creates an in-memory public register repository for testing
 *
 * @param {InMemoryPublicRegisterRepositoryConfig} [config={}]
 * @returns {import('#domain/public-register/repository/port.js').PublicRegisterRepository}
 */
export const createInMemoryPublicRegisterRepository = (config = {}) => {
  const s3Bucket = config.s3Bucket ?? 'test-bucket'
  const preSignedUrlExpiry = config.preSignedUrlExpiry ?? 3600

  /** @type {Map<string, string>} */
  const storage = new Map()

  /** @type {Map<string, string>} */
  const preSignedUrls = new Map()

  return {
    /**
     * Save CSV data to in-memory storage
     *
     * @param {string} fileName - The file name/key
     * @param {string} csv - CSV content to save
     */
    async save(fileName, csv) {
      storage.set(fileName, csv)
    },

    /**
     * Fetch CSV data from a mock pre-signed URL
     *
     * @param {string} url - Mock pre-signed URL or file name
     * @returns {Promise<string>} The CSV content
     * @throws {Error} If file not found
     */
    async fetchFromPresignedUrl(url) {
      if (!preSignedUrls.has(url)) {
        throw new Error(`Pre signed url not found: ${url}`)
      }
      const fileName = preSignedUrls.get(url)
      return storage.get(fileName)
    },

    /**
     * Generate a mock pre-signed URL
     *
     * @param {string} fileName - The file name/key
     * @returns {Promise<PresignedUrlResult>} Mock pre-signed URL with expiry info
     * @throws {Error} If file not found
     */
    async generatePresignedUrl(fileName) {
      if (!storage.has(fileName)) {
        throw new Error(`File not found: ${fileName}`)
      }
      const url = `https://re-ex-public-register.test/${s3Bucket}/${fileName}/pre-signed-url`
      preSignedUrls.set(url, fileName)
      const expiresAt = new Date(
        Date.now() + preSignedUrlExpiry * 1000
      ).toISOString()
      return {
        url,
        expiresAt
      }
    }
  }
}

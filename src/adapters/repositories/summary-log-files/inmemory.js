import { parseS3Uri } from '#adapters/repositories/uploads/s3-uri.js'

const SIXTY_SECONDS = 60

/**
 * Creates an in-memory summary log files repository for testing.
 *
 * @param {Object} [config]
 * @param {number} [config.preSignedUrlExpiry]
 * @returns {import('./port.js').SummaryLogFilesRepository}
 */
export const createInMemorySummaryLogFilesRepository = (config = {}) => {
  const preSignedUrlExpiry = config.preSignedUrlExpiry ?? SIXTY_SECONDS

  return {
    async getDownloadUrl(s3Uri) {
      const { Bucket, Key } = parseS3Uri(s3Uri)
      const url = `https://${Bucket}.test/${Key}/pre-signed-url`
      const expiresAt = new Date(
        Date.now() + preSignedUrlExpiry * 1000
      ).toISOString()

      return { url, expiresAt }
    }
  }
}

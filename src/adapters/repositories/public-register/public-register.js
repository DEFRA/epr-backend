import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/** @typedef {import('@aws-sdk/client-s3').S3Client} S3Client */
/** @typedef {import('#domain/public-register/repository/port.js').PresignedUrlResult} PresignedUrlResult */

/**
 * @typedef {Object} PublicRegisterRepositoryConfig
 * @property {S3Client} s3Client - AWS S3 client
 * @property {string} s3Bucket - S3 bucket for public register
 * @property {number} preSignedUrlExpiry - Expiry time for pre-signed URLs in seconds
 */

/**
 * Creates an S3-based public register repository
 *
 * @param {PublicRegisterRepositoryConfig} config
 * @returns {import('#domain/public-register/repository/port.js').PublicRegisterRepository}
 */
export const createPublicRegisterRepository = ({
  s3Client,
  s3Bucket,
  preSignedUrlExpiry
}) => ({
  /**
   * Save CSV data to S3
   *
   * @param {string} fileName - The file name/key
   * @param {string} csv - CSV content to save
   */
  async save(fileName, csv) {
    const command = new PutObjectCommand({
      Bucket: s3Bucket,
      Key: fileName,
      Body: csv,
      ContentType: 'text/csv'
    })

    await s3Client.send(command)
  },

  /**
   * Fetch CSV data from a pre-signed URL
   *
   * @param {string} url - Pre-signed URL
   * @returns {Promise<string>} The CSV content
   */
  async fetchFromPresignedUrl(url) {
    const response = await fetch(url)
    return response.text()
  },

  /**
   * Generate a pre-signed URL for accessing the file
   *
   * @param {string} fileName - The file name/key
   * @returns {Promise<PresignedUrlResult>} Pre-signed URL with expiry info
   */
  async generatePresignedUrl(fileName) {
    const command = new GetObjectCommand({
      Bucket: s3Bucket,
      Key: fileName
    })

    const url = await getSignedUrl(s3Client, command, {
      expiresIn: preSignedUrlExpiry
    })

    const expiresAt = new Date(
      Date.now() + preSignedUrlExpiry * 1000
    ).toISOString()

    return {
      url,
      expiresAt
    }
  }
})

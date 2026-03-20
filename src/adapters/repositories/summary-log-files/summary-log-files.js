import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

import { parseS3Uri } from '#adapters/repositories/uploads/s3-uri.js'

/** @typedef {import('@aws-sdk/client-s3').S3Client} S3Client */

/**
 * @typedef {Object} SummaryLogFilesRepositoryConfig
 * @property {S3Client} s3Client - AWS S3 client
 * @property {number} preSignedUrlExpiry - Expiry time for pre-signed URLs in seconds
 */

/**
 * Creates an S3-based summary log files repository for generating
 * pre-signed download URLs from S3 URIs.
 *
 * @param {SummaryLogFilesRepositoryConfig} config
 * @returns {import('./port.js').SummaryLogFilesRepository}
 */
export const createSummaryLogFilesRepository = ({
  s3Client,
  preSignedUrlExpiry
}) => ({
  async getDownloadUrl(s3Uri) {
    const { Bucket, Key } = parseS3Uri(s3Uri)

    const command = new GetObjectCommand({ Bucket, Key })

    const url = await getSignedUrl(s3Client, command, {
      expiresIn: preSignedUrlExpiry
    })

    const expiresAt = new Date(
      Date.now() + preSignedUrlExpiry * 1000
    ).toISOString()

    return { url, expiresAt }
  }
})

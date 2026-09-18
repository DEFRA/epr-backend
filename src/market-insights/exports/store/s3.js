import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/** @import { S3Client } from '@aws-sdk/client-s3' */
/** @import { MarketInsightsExportStore } from './port.js' */

const MILLISECONDS_PER_SECOND = 1000

/**
 * @param {Object} config
 * @param {S3Client} config.s3Client
 * @param {string} config.s3Bucket
 * @param {number} config.preSignedUrlExpiry - seconds
 * @returns {MarketInsightsExportStore}
 */
export const createS3MarketInsightsExportStore = ({
  s3Client,
  s3Bucket,
  preSignedUrlExpiry
}) => ({
  async save({ key, body }) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: body,
        ContentType: 'application/zip'
      })
    )
  },

  async signDownload({ key, fileName }) {
    const url = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        // Without it the browser derives a name from the URL path, which
        // carries the presigning query string with it.
        ResponseContentDisposition: `attachment; filename="${fileName}"`
      }),
      { expiresIn: preSignedUrlExpiry }
    )

    return {
      url,
      expiresAt: new Date(
        Date.now() + preSignedUrlExpiry * MILLISECONDS_PER_SECOND
      ).toISOString()
    }
  }
})

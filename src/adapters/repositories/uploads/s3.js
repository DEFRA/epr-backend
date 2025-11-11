import { GetObjectCommand } from '@aws-sdk/client-s3'
import { StatusCodes } from 'http-status-codes'

/** @typedef {import('@aws-sdk/client-s3').S3Client} S3Client */

/**
 * Parses an S3 URI into bucket and key components
 * @param {string} uri - S3 URI in format s3://bucket/key
 * @returns {{ Bucket: string, Key: string }} S3 location object
 * @throws {Error} If URI is malformed or missing required components
 */
const parseS3Uri = (uri) => {
  // Parse S3 URI using built-in URL class
  let url
  try {
    url = new URL(uri)
  } catch (error) {
    throw new Error(`Malformed URI: ${uri}`)
  }

  if (url.protocol !== 's3:') {
    throw new Error(`Expected s3:// protocol, got: ${url.protocol}`)
  }

  if (!url.hostname) {
    throw new Error(`Missing bucket in S3 URI: ${uri}`)
  }

  if (!url.pathname || url.pathname === '/') {
    throw new Error(`Missing key in S3 URI: ${uri}`)
  }

  return {
    Bucket: url.hostname,
    Key: url.pathname.slice(1) // Remove leading slash
  }
}

/**
 * @param {S3Client} s3Client
 * @returns {import('#domain/uploads/repository/port.js').UploadsRepository}
 */
export const createUploadsRepository = (s3Client) => ({
  async findByLocation(uri) {
    const { Bucket: bucket, Key: key } = parseS3Uri(uri)

    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key
      })

      const response = await s3Client.send(command)

      if (!response.Body) {
        throw new Error(`S3 GetObject returned no body for ${uri}`)
      }

      const buffer = await response.Body.transformToByteArray()

      return Buffer.from(buffer)
    } catch (error) {
      if (
        error.name === 'NoSuchKey' ||
        error.$metadata?.httpStatusCode === StatusCodes.NOT_FOUND
      ) {
        return null
      }

      throw error
    }
  }
})

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { StatusCodes } from 'http-status-codes'

/** @typedef {import('@aws-sdk/client-s3').S3Client} S3Client */

/**
 * @param {S3Client} s3Client
 * @returns {import('./port.js').UploadsRepository}
 */
export const createUploadsRepository = (s3Client) => ({
  async findByLocation({ bucket, key }) {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key
      })

      const response = await s3Client.send(command)

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

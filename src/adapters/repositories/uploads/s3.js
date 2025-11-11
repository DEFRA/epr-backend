import { GetObjectCommand } from '@aws-sdk/client-s3'
import { StatusCodes } from 'http-status-codes'
import { parseS3Uri } from './s3-uri.js'

/** @typedef {import('@aws-sdk/client-s3').S3Client} S3Client */

/**
 * @param {S3Client} s3Client
 * @returns {import('#domain/uploads/repository/port.js').UploadsRepository}
 */
export const createUploadsRepository = (s3Client) => ({
  async findByLocation(uri) {
    const s3Location = parseS3Uri(uri)

    try {
      const command = new GetObjectCommand(s3Location)

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

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { StatusCodes } from 'http-status-codes'
import { parseS3Uri } from './s3-uri.js'
import { fetchJson } from '#common/helpers/fetch-json.js'

/** @typedef {import('@aws-sdk/client-s3').S3Client} S3Client */

/**
 * @typedef {Object} UploadsRepositoryConfig
 * @property {S3Client} s3Client - AWS S3 client
 * @property {string} cdpUploaderUrl - CDP Uploader service URL
 * @property {string} frontendUrl - Frontend base URL for redirects
 * @property {string} backendUrl - Backend base URL for callbacks
 * @property {string} s3Bucket - S3 bucket for summary log uploads
 */

const SUMMARY_LOG_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]

/**
 * @param {UploadsRepositoryConfig} config
 * @returns {import('#domain/uploads/repository/port.js').UploadsRepository}
 */
export const createUploadsRepository = ({
  s3Client,
  cdpUploaderUrl,
  frontendUrl,
  backendUrl,
  s3Bucket
}) => ({
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
  },

  async initiateSummaryLogUpload({
    organisationId,
    registrationId,
    summaryLogId
  }) {
    const s3Path = `/organisations/${organisationId}/registrations/${registrationId}`

    return fetchJson(`${cdpUploaderUrl}/initiate`, {
      method: 'POST',
      body: JSON.stringify({
        redirect: `${frontendUrl}/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`,
        callback: `${backendUrl}/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`,
        s3Bucket,
        s3Path,
        mimeTypes: SUMMARY_LOG_MIME_TYPES,
        metadata: { summaryLogId }
      })
    })
  }
})

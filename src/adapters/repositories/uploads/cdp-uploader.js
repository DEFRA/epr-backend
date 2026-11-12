import { DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { StatusCodes } from 'http-status-codes'
import { parseUploadUri } from './s3-uri.js'
import { fetchJson } from '#common/helpers/fetch-json.js'
import {
  orsImportUploadPath,
  summaryLogUploadPath
} from '#domain/uploads/upload-locations.js'

/** @typedef {import('@aws-sdk/client-s3').S3Client} S3Client */

/**
 * @typedef {Object} UploadsRepositoryConfig
 * @property {S3Client} s3Client - AWS S3 client
 * @property {string} cdpUploaderUrl - CDP Uploader service URL
 * @property {string} summaryLogsBucket - S3 bucket for summary log uploads
 * @property {string} orsBucket - S3 bucket for ORS file uploads
 */

const SUMMARY_LOG_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]

const ORS_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.sheet.macroenabled.12'
]

/**
 * @param {UploadsRepositoryConfig} config
 * @returns {import('#domain/uploads/repository/port.js').UploadsRepository}
 */
export const createUploadsRepository = ({
  s3Client,
  cdpUploaderUrl,
  summaryLogsBucket,
  orsBucket
}) => {
  const uploadBuckets = [summaryLogsBucket, orsBucket]

  return {
    async findByLocation(uri) {
      const s3Location = parseUploadUri(uri, uploadBuckets)

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

    async deleteByLocation(uri) {
      const s3Location = parseUploadUri(uri, uploadBuckets)
      await s3Client.send(new DeleteObjectCommand(s3Location))
    },

    async initiateSummaryLogUpload({
      organisationId,
      registrationId,
      summaryLogId,
      redirectUrl,
      callbackUrl,
      callbackSignature
    }) {
      const s3Path = summaryLogUploadPath({ organisationId, registrationId })

      return fetchJson(`${cdpUploaderUrl}/initiate`, {
        method: 'POST',
        body: JSON.stringify({
          redirect: redirectUrl,
          callback: callbackUrl,
          s3Bucket: summaryLogsBucket,
          s3Path,
          mimeTypes: SUMMARY_LOG_MIME_TYPES,
          metadata: { summaryLogId, signature: callbackSignature }
        })
      })
    },

    async initiateOrsImport({
      importId,
      redirectUrl,
      callbackUrl,
      callbackSignature
    }) {
      const s3Path = orsImportUploadPath(importId)

      return fetchJson(`${cdpUploaderUrl}/initiate`, {
        method: 'POST',
        body: JSON.stringify({
          redirect: redirectUrl,
          callback: callbackUrl,
          s3Bucket: orsBucket,
          s3Path,
          mimeTypes: ORS_MIME_TYPES,
          metadata: { importId, signature: callbackSignature }
        })
      })
    }
  }
}

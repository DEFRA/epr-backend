import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getCognitoToken } from '#common/helpers/cognito-token.js'
import { fetchJson } from '#common/helpers/fetch-json.js'
import { config } from '../../../config.js'

/** @typedef {import('@aws-sdk/client-s3').S3Client} S3Client */

/**
 * @typedef {Object} FormsFileUploadsRepositoryConfig
 * @property {S3Client} s3Client - AWS S3 client
 */

const getRetrievalKeyForRegulator = (regulator) => {
  return config.get(`regulator.${regulator.toUpperCase()}.email`)
}

/**
 * Creates a Forms File Uploads Repository
 * Handles file operations with Forms Submission API and S3 storage
 *
 * @param {FormsFileUploadsRepositoryConfig} config
 * @returns {Object} Repository with file operations
 */
export const createFormsFileUploadsRepository = ({ s3Client }) => {
  const getPresignedUrl = async (accessToken, fileId, retrievalKey) => {
    const apiUrl = config.get('formsSubmissionApi.url')

    const response = await fetchJson(`${apiUrl}/file/link`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileId,
        retrievalKey
      })
    })

    return response.url
  }

  const saveToS3 = async (presignedUrl, s3Key) => {
    const s3Bucket = config.get('formsSubmissionApi.s3Bucket')

    const response = await fetch(presignedUrl)

    if (!response.ok) {
      throw new Error(
        `Failed to download file: ${response.status} ${response.statusText}`
      )
    }

    const command = new PutObjectCommand({
      Bucket: s3Bucket,
      Key: s3Key,
      Body: response.body
    })

    await s3Client.send(command)
  }

  return {
    /**
     * Copy file from Forms Submission API to S3
     *
     * @param {Object} params
     * @param {string} params.fileId - File ID from Forms Submission API (used as S3 key)
     * @param {import('#domain/organisations/model.js').RegulatorValue} params.regulator - Regulator enum
     * @returns {Promise<void>}
     */
    async copyFormFileToS3({ fileId, regulator }) {
      const clientId = config.get('formsSubmissionApi.cognitoClientId')
      const clientSecret = config.get('formsSubmissionApi.cognitoClientSecret')
      const serviceName = config.get('formsSubmissionApi.serviceName')

      const retrievalKey = getRetrievalKeyForRegulator(regulator)
      const accessToken = await getCognitoToken(
        clientId,
        clientSecret,
        serviceName
      )
      const presignedUrl = await getPresignedUrl(
        accessToken,
        fileId,
        retrievalKey
      )
      await saveToS3(presignedUrl, fileId)
    },

    /**
     * Get file from S3 by file ID
     *
     * @param {string} fileId - File ID (S3 key)
     * @returns {Promise<import('stream').Readable>} File content as readable stream
     */
    async getFileById(fileId) {
      const s3Bucket = config.get('formsSubmissionApi.s3Bucket')

      const command = new GetObjectCommand({
        Bucket: s3Bucket,
        Key: fileId
      })

      const response = await s3Client.send(command)
      return response.Body
    }
  }
}

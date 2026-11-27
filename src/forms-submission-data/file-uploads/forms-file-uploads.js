import { GetObjectCommand } from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import { getCognitoToken } from '#common/helpers/cognito-token.js'
import { fetchJson } from '#common/helpers/fetch-json.js'
import { getRetrievalKeyForRegulator } from '#formsubmission/file-uploads/get-retrieval-key.js'

/** @typedef {import('@aws-sdk/client-s3').S3Client} S3Client */
/** @import { FormsFileUploadsRepository } from './port.js' */
/** @import { RegulatorEmails } from './get-retrieval-key.js' */

/**
 * @typedef {{
 *   url: string
 *   s3Bucket: string
 *   cognitoClientId: string
 *   cognitoClientSecret: string
 *   cognitoTokenUrl: string
 * }} FormsSubmissionApi
 */

/**
 * @typedef {Object} FormsFileUploadsRepositoryOptions
 * @property {S3Client} s3Client - AWS S3 client
 * @property {FormsSubmissionApi} formsSubmissionApi - where the Forms Submission API is, how to sign in to it, and the bucket its files are copied to
 * @property {RegulatorEmails} regulators - each regulator's email addresses, which the API takes as the key to its files
 */

/**
 * Creates a Forms File Uploads Repository
 * Handles file operations with Forms Submission API and S3 storage
 *
 * @param {FormsFileUploadsRepositoryOptions} options
 * @returns {FormsFileUploadsRepository}
 */
export const createFormsFileUploadsRepository = ({
  s3Client,
  formsSubmissionApi,
  regulators
}) => {
  const getPresignedUrl = async (accessToken, fileId, retrievalKey) => {
    const response = await fetchJson(`${formsSubmissionApi.url}/file/link`, {
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
    const response = await fetch(presignedUrl)

    if (!response.ok) {
      throw new Error(
        `Failed to download file: ${response.status} ${response.statusText}`
      )
    }

    if (!response.body) {
      throw new Error('Failed to download file: response body is null')
    }

    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: formsSubmissionApi.s3Bucket,
        Key: s3Key,
        Body: response.body
      }
    })

    await upload.done()
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
      const retrievalKeyForRegulator = getRetrievalKeyForRegulator(
        regulators,
        regulator
      )

      const accessToken = await getCognitoToken(
        formsSubmissionApi.cognitoClientId,
        formsSubmissionApi.cognitoClientSecret,
        formsSubmissionApi.cognitoTokenUrl
      )
      const presignedUrl = await getPresignedUrl(
        accessToken,
        fileId,
        retrievalKeyForRegulator
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
      const command = new GetObjectCommand({
        Bucket: formsSubmissionApi.s3Bucket,
        Key: fileId
      })

      const response = await s3Client.send(command)

      if (!response.Body) {
        throw new Error(`File not found in S3: ${fileId}`)
      }

      return /** @type {import('stream').Readable} */ (response.Body)
    }
  }
}

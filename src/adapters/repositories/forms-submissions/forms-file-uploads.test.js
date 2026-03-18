import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFormsFileUploadsRepository } from './forms-file-uploads.js'

const mockGetCognitoToken = vi.fn()
const mockFetchJson = vi.fn()
const mockUploadDone = vi.fn()

vi.mock('#common/helpers/cognito-token.js', () => ({
  getCognitoToken: (...args) => mockGetCognitoToken(...args)
}))

vi.mock('#common/helpers/fetch-json.js', () => ({
  fetchJson: (...args) => mockFetchJson(...args)
}))

vi.mock('@aws-sdk/lib-storage', () => ({
  Upload: vi.fn(function () {
    this.done = mockUploadDone
  })
}))

describe('createFormsFileUploadsRepository', () => {
  let mockS3Client
  let repository
  let originalFetch

  beforeEach(() => {
    vi.clearAllMocks()

    originalFetch = global.fetch

    mockS3Client = {
      send: vi.fn()
    }

    repository = createFormsFileUploadsRepository({ s3Client: mockS3Client })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('copyFormFileToS3', () => {
    it('should successfully copy file from Forms API to S3', async () => {
      const { Upload } = await import('@aws-sdk/lib-storage')
      const fileId = 'test-file-123'
      const regulator = 'ea'
      const accessToken = 'test-access-token'
      const presignedUrl = 'https://presigned.example.com/file'
      const mockBody = { type: 'ReadableStream' }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: mockBody
      })

      mockGetCognitoToken.mockResolvedValue(accessToken)
      mockFetchJson.mockResolvedValue({ url: presignedUrl })
      mockUploadDone.mockResolvedValue({})

      await repository.copyFormFileToS3({ fileId, regulator })

      expect(mockGetCognitoToken).toHaveBeenCalledWith(
        'client-id',
        'client-secret',
        'https://forms-submission-api.auth.eu-west-2.amazoncognito.com/oauth2/token'
      )

      expect(mockFetchJson).toHaveBeenCalledWith(
        'https://forms-submission-api.local.cdp-int.defra.cloud/file/link',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-access-token',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileId: 'test-file-123',
            retrievalKey: 'test@ea.gov.uk'
          })
        }
      )
      expect(global.fetch).toHaveBeenCalledWith(presignedUrl)
      expect(Upload).toHaveBeenCalledWith({
        client: mockS3Client,
        params: {
          Bucket: 're-ex-form-uploads',
          Key: fileId,
          Body: mockBody
        }
      })
      expect(mockUploadDone).toHaveBeenCalled()
    })

    it('should throw error when file download fails', async () => {
      const fileId = 'test-file-123'
      const regulator = 'ea'
      const accessToken = 'test-access-token'
      const presignedUrl = 'https://presigned.example.com/file'

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      })

      mockGetCognitoToken.mockResolvedValue(accessToken)
      mockFetchJson.mockResolvedValue({ url: presignedUrl })

      await expect(
        repository.copyFormFileToS3({ fileId, regulator })
      ).rejects.toThrow('Failed to download file: 404 Not Found')

      expect(mockUploadDone).not.toHaveBeenCalled()
    })

    it('should throw error when response body is null', async () => {
      const fileId = 'test-file-123'
      const regulator = 'ea'
      const accessToken = 'test-access-token'
      const presignedUrl = 'https://presigned.example.com/file'

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: null
      })

      mockGetCognitoToken.mockResolvedValue(accessToken)
      mockFetchJson.mockResolvedValue({ url: presignedUrl })

      await expect(
        repository.copyFormFileToS3({ fileId, regulator })
      ).rejects.toThrow('Failed to download file: response body is null')

      expect(mockUploadDone).not.toHaveBeenCalled()
    })

    it('should throw error when S3 upload fails', async () => {
      const fileId = 'test-file-123'
      const regulator = 'sepa'
      const accessToken = 'test-access-token'
      const presignedUrl = 'https://presigned.example.com/file'
      const mockBody = { type: 'ReadableStream' }
      const s3Error = new Error('S3 upload failed')

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: mockBody
      })

      mockGetCognitoToken.mockResolvedValue(accessToken)
      mockFetchJson.mockResolvedValue({ url: presignedUrl })
      mockUploadDone.mockRejectedValue(s3Error)

      await expect(
        repository.copyFormFileToS3({ fileId, regulator })
      ).rejects.toThrow(s3Error)
    })

    it('should throw error when getting presigned URL fails', async () => {
      const fileId = 'test-file-123'
      const regulator = 'ea'
      const accessToken = 'test-access-token'
      const apiError = new Error('API error')

      mockGetCognitoToken.mockResolvedValue(accessToken)
      mockFetchJson.mockRejectedValue(apiError)

      await expect(
        repository.copyFormFileToS3({ fileId, regulator })
      ).rejects.toThrow(apiError)

      expect(mockUploadDone).not.toHaveBeenCalled()
    })

    it('should throw error when getting Cognito token fails', async () => {
      const fileId = 'test-file-123'
      const regulator = 'ea'
      const cognitoError = new Error('Cognito authentication failed')

      mockGetCognitoToken.mockRejectedValue(cognitoError)

      await expect(
        repository.copyFormFileToS3({ fileId, regulator })
      ).rejects.toThrow(cognitoError)

      expect(mockFetchJson).not.toHaveBeenCalled()
      expect(mockUploadDone).not.toHaveBeenCalled()
    })
  })

  describe('getFileById', () => {
    it('should successfully retrieve file from S3', async () => {
      const fileId = 'test-file-123'
      const fileBody = 'file content stream'

      mockS3Client.send.mockResolvedValue({
        Body: fileBody
      })

      const result = await repository.getFileById(fileId)

      const s3Command = mockS3Client.send.mock.calls[0][0]
      expect(s3Command.input).toEqual({
        Bucket: 're-ex-form-uploads',
        Key: 'test-file-123'
      })

      expect(result).toBe(fileBody)
    })

    it('should throw error when S3 retrieval fails', async () => {
      const fileId = 'test-file-123'
      const s3Error = new Error('S3 retrieval failed')

      mockS3Client.send.mockRejectedValue(s3Error)

      await expect(repository.getFileById(fileId)).rejects.toThrow(s3Error)
    })

    it('should throw error when S3 response Body is undefined', async () => {
      const fileId = 'test-file-123'

      mockS3Client.send.mockResolvedValue({ Body: undefined })

      await expect(repository.getFileById(fileId)).rejects.toThrow(
        `File not found in S3: ${fileId}`
      )
    })
  })
})

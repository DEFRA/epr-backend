import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFormsFileUploadsRepository } from './forms-file-uploads.js'

const mockGetCognitoToken = vi.fn()
const mockFetchJson = vi.fn()
const mockConfigGet = vi.fn()

vi.mock('#common/helpers/cognito-token.js', () => ({
  getCognitoToken: (...args) => mockGetCognitoToken(...args)
}))

vi.mock('#common/helpers/fetch-json.js', () => ({
  fetchJson: (...args) => mockFetchJson(...args)
}))

vi.mock('../../../config.js', () => ({
  config: {
    get: (...args) => mockConfigGet(...args)
  }
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

    mockConfigGet.mockImplementation((key) => {
      const config = {
        'formsSubmissionApi.url': 'https://api.example.com',
        'formsSubmissionApi.s3Bucket': 'test-bucket',
        'formsSubmissionApi.cognitoClientId': 'test-client-id',
        'formsSubmissionApi.cognitoClientSecret': 'test-client-secret',
        'formsSubmissionApi.serviceName': 'test-service',
        'regulator.EA.email': 'ea@example.com',
        'regulator.SEPA.email': 'sepa@example.com'
      }
      return config[key]
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  describe('copyFormFileToS3', () => {
    it('should successfully copy file from Forms API to S3', async () => {
      const fileId = 'test-file-123'
      const regulator = 'ea'
      const accessToken = 'test-access-token'
      const presignedUrl = 'https://presigned.example.com/file'
      const fileBody = 'file content'

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: fileBody
      })

      mockGetCognitoToken.mockResolvedValue(accessToken)
      mockFetchJson.mockResolvedValue({ url: presignedUrl })
      mockS3Client.send.mockResolvedValue({})

      await repository.copyFormFileToS3({ fileId, regulator })

      expect(mockGetCognitoToken).toHaveBeenCalledWith(
        'test-client-id',
        'test-client-secret',
        'test-service'
      )

      expect(mockFetchJson).toHaveBeenCalledWith(
        'https://api.example.com/file/link',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-access-token',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fileId: 'test-file-123',
            retrievalKey: 'ea@example.com'
          })
        }
      )

      expect(global.fetch).toHaveBeenCalledWith(presignedUrl)

      const s3Command = mockS3Client.send.mock.calls[0][0]
      expect(s3Command.input).toEqual({
        Bucket: 'test-bucket',
        Key: 'test-file-123',
        Body: fileBody
      })
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

      expect(mockS3Client.send).not.toHaveBeenCalled()
    })

    it('should throw error when S3 upload fails', async () => {
      const fileId = 'test-file-123'
      const regulator = 'sepa'
      const accessToken = 'test-access-token'
      const presignedUrl = 'https://presigned.example.com/file'
      const fileBody = 'file content'
      const s3Error = new Error('S3 upload failed')

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        body: fileBody
      })

      mockGetCognitoToken.mockResolvedValue(accessToken)
      mockFetchJson.mockResolvedValue({ url: presignedUrl })
      mockS3Client.send.mockRejectedValue(s3Error)

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

      expect(mockS3Client.send).not.toHaveBeenCalled()
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
      expect(mockS3Client.send).not.toHaveBeenCalled()
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
        Bucket: 'test-bucket',
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
  })
})

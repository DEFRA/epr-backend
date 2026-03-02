import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFormsFileUploadsRepository } from './forms-file-uploads.js'

const mockGetCognitoToken = vi.fn()
const mockFetchJson = vi.fn()

vi.mock('#common/helpers/cognito-token.js', () => ({
  getCognitoToken: (...args) => mockGetCognitoToken(...args)
}))

vi.mock('#common/helpers/fetch-json.js', () => ({
  fetchJson: (...args) => mockFetchJson(...args)
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
      const fileId = 'test-file-123'
      const regulator = 'ea'
      const accessToken = 'test-access-token'
      const presignedUrl = 'https://presigned.example.com/file'
      const fileContent = 'file content'
      const mockArrayBuffer = new TextEncoder().encode(fileContent).buffer
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer),
        headers: {
          get: vi.fn().mockReturnValue('text/plain')
        }
      })

      mockGetCognitoToken.mockResolvedValue(accessToken)
      mockFetchJson.mockResolvedValue({ url: presignedUrl })
      mockS3Client.send.mockResolvedValue({})

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
      const s3Command = mockS3Client.send.mock.calls[0][0]
      expect(s3Command.input.Bucket).toBe('re-ex-form-uploads')
      expect(s3Command.input.Key).toBe(fileId)
      expect(s3Command.input.Body).toBeInstanceOf(Buffer)
      expect(s3Command.input.Body.toString()).toBe(fileContent)
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
      const fileContent = 'file content'
      const mockArrayBuffer = new TextEncoder().encode(fileContent).buffer
      const s3Error = new Error('S3 upload failed')

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer),
        headers: { get: vi.fn() }
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
  })
})

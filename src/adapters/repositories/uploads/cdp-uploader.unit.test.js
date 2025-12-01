import { describe, it, expect, vi } from 'vitest'
import { createUploadsRepository } from './cdp-uploader.js'

const testConfig = {
  cdpUploaderUrl: 'https://cdp-uploader.test',
  frontendUrl: 'https://frontend.test',
  backendUrl: 'https://backend.test',
  s3Bucket: 'test-bucket'
}

describe('CDP Uploader error handling', () => {
  it('throws error when response.Body is undefined', async () => {
    const mockS3Client = {
      send: vi.fn().mockResolvedValue({ Body: undefined })
    }

    const repository = createUploadsRepository({
      s3Client: mockS3Client,
      ...testConfig
    })

    await expect(repository.findByLocation('s3://test/test')).rejects.toThrow(
      'S3 GetObject returned no body for s3://test/test'
    )
  })

  it('re-throws unexpected errors', async () => {
    const mockS3Client = {
      send: vi.fn().mockRejectedValue(new Error('Network error'))
    }

    const repository = createUploadsRepository({
      s3Client: mockS3Client,
      ...testConfig
    })

    await expect(repository.findByLocation('s3://test/test')).rejects.toThrow(
      'Network error'
    )
  })
})

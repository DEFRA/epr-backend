import { describe, it, expect, vi } from 'vitest'
import { S3Client } from '@aws-sdk/client-s3'

import { createSummaryLogFilesRepository } from './summary-log-files.js'

vi.mock('@aws-sdk/client-s3', async () => {
  const actual = await vi.importActual('@aws-sdk/client-s3')

  class MockS3Client {
    constructor() {
      this.send = vi.fn()
    }
  }

  return {
    ...actual,
    S3Client: MockS3Client
  }
})

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockImplementation(async (_client, command) => {
    return `https://${command.input.Bucket}.s3.amazonaws.com/${command.input.Key}?signed=true`
  })
}))

describe('S3 summary log files repository', () => {
  const SIXTY_SECONDS = 60

  it('generates a pre-signed URL from an S3 URI', async () => {
    const s3Client = new S3Client({ region: 'eu-west-2' })
    const repository = createSummaryLogFilesRepository({
      s3Client,
      preSignedUrlExpiry: SIXTY_SECONDS
    })

    const result = await repository.getDownloadUrl(
      's3://re-ex-summary-logs/uploads/test-file.xlsx'
    )

    expect(result.url).toContain('re-ex-summary-logs')
    expect(result.url).toContain('uploads/test-file.xlsx')
    expect(result.expiresAt).toBeTruthy()
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('parses the S3 URI correctly to extract bucket and key', async () => {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
    const s3Client = new S3Client({ region: 'eu-west-2' })
    const repository = createSummaryLogFilesRepository({
      s3Client,
      preSignedUrlExpiry: SIXTY_SECONDS
    })

    await repository.getDownloadUrl('s3://my-bucket/path/to/file.xlsx')

    expect(getSignedUrl).toHaveBeenCalledWith(
      s3Client,
      expect.objectContaining({
        input: { Bucket: 'my-bucket', Key: 'path/to/file.xlsx' }
      }),
      { expiresIn: SIXTY_SECONDS }
    )
  })
})

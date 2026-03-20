import { describe, it, expect } from 'vitest'

import { createInMemorySummaryLogFilesRepository } from './inmemory.js'

describe('in-memory summary log files repository', () => {
  it('generates a pre-signed URL from an S3 URI', async () => {
    const repository = createInMemorySummaryLogFilesRepository()

    const result = await repository.getDownloadUrl(
      's3://re-ex-summary-logs/uploads/test-file.xlsx'
    )

    expect(result.url).toContain('re-ex-summary-logs')
    expect(result.url).toContain('uploads/test-file.xlsx')
    expect(result.expiresAt).toBeTruthy()
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('uses custom expiry when provided', async () => {
    const TEN_SECONDS = 10
    const repository = createInMemorySummaryLogFilesRepository({
      preSignedUrlExpiry: TEN_SECONDS
    })

    const before = Date.now()
    const result = await repository.getDownloadUrl('s3://bucket/key.xlsx')
    const expiresAtMs = new Date(result.expiresAt).getTime()

    expect(expiresAtMs).toBeGreaterThanOrEqual(before + TEN_SECONDS * 1000)
  })
})

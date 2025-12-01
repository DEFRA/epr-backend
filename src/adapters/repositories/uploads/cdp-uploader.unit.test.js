import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createUploadsRepository } from './cdp-uploader.js'

const testConfig = {
  cdpUploaderUrl: 'https://cdp-uploader.test',
  backendUrl: 'https://backend.test',
  s3Bucket: 'test-bucket'
}

describe('initiateSummaryLogUpload', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        uploadId: 'up-123',
        uploadUrl: 'http://cdp/upload',
        statusUrl: 'http://cdp/status'
      })
    })
  })

  it('substitutes {summaryLogId} placeholder in redirectUrl', async () => {
    const repository = createUploadsRepository({
      s3Client: {},
      ...testConfig
    })

    await repository.initiateSummaryLogUpload({
      organisationId: 'org-123',
      registrationId: 'reg-456',
      summaryLogId: 'sl-789',
      redirectUrl:
        '/organisations/org-123/registrations/reg-456/summary-logs/{summaryLogId}'
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://cdp-uploader.test/initiate',
      expect.objectContaining({
        body: expect.stringContaining(
          '"redirect":"/organisations/org-123/registrations/reg-456/summary-logs/sl-789"'
        )
      })
    )
  })

  it('leaves redirectUrl unchanged when no placeholder present', async () => {
    const repository = createUploadsRepository({
      s3Client: {},
      ...testConfig
    })

    await repository.initiateSummaryLogUpload({
      organisationId: 'org-123',
      registrationId: 'reg-456',
      summaryLogId: 'sl-789',
      redirectUrl: '/some/other/path'
    })

    expect(global.fetch).toHaveBeenCalledWith(
      'https://cdp-uploader.test/initiate',
      expect.objectContaining({
        body: expect.stringContaining('"redirect":"/some/other/path"')
      })
    )
  })
})

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

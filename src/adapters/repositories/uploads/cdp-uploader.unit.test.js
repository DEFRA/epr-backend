import { describe, it, expect, vi } from 'vitest'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { createUploadsRepository } from './cdp-uploader.js'

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    DeleteObjectCommand: vi.fn()
  }
})

const testConfig = {
  cdpUploaderUrl: 'https://cdp-uploader.test',
  backendUrl: 'https://backend.test',
  summaryLogsBucket: 'test-summary-logs-bucket',
  orsBucket: 'test-ors-bucket'
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

describe('initiateSummaryLogUpload', () => {
  it('sends summary logs bucket in the request body', async () => {
    const mockS3Client = { send: vi.fn() }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            uploadId: 'upload-1',
            uploadUrl: 'https://cdp-uploader.test/upload-and-scan/upload-1',
            statusUrl: 'https://cdp-uploader.test/status/upload-1'
          })
      })
    )

    const repository = createUploadsRepository({
      s3Client: mockS3Client,
      ...testConfig
    })

    await repository.initiateSummaryLogUpload({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      summaryLogId: 'sl-1',
      redirectUrl: 'https://frontend.test/redirect',
      callbackUrl: 'https://backend.test/callback'
    })

    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(fetchCall[1].body)
    expect(body.s3Bucket).toBe('test-summary-logs-bucket')

    vi.unstubAllGlobals()
  })
})

describe('initiateOrsImport', () => {
  it('sends ORS bucket in the request body', async () => {
    const mockS3Client = { send: vi.fn() }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            uploadId: 'upload-1',
            uploadUrl: 'https://cdp-uploader.test/upload-and-scan/upload-1',
            statusUrl: 'https://cdp-uploader.test/status/upload-1'
          })
      })
    )

    const repository = createUploadsRepository({
      s3Client: mockS3Client,
      ...testConfig
    })

    await repository.initiateOrsImport({
      importId: 'import-1',
      redirectUrl: 'https://admin.test/redirect',
      callbackUrl: 'https://backend.test/callback'
    })

    const fetchCall = vi.mocked(fetch).mock.calls[0]
    const body = JSON.parse(fetchCall[1].body)
    expect(body.s3Bucket).toBe('test-ors-bucket')

    vi.unstubAllGlobals()
  })
})

describe('deleteByLocation', () => {
  it('sends DeleteObjectCommand with parsed S3 URI', async () => {
    const mockS3Client = {
      send: vi.fn().mockResolvedValue({})
    }

    vi.mocked(DeleteObjectCommand).mockImplementation(function (params) {
      Object.assign(this, params)
    })

    const repository = createUploadsRepository({
      s3Client: mockS3Client,
      ...testConfig
    })

    await repository.deleteByLocation('s3://my-bucket/path/to/file.xlsx')

    expect(mockS3Client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'my-bucket',
        Key: 'path/to/file.xlsx'
      })
    )
  })
})

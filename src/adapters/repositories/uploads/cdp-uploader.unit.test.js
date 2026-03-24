import { afterEach, describe, it, expect, vi } from 'vitest'
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

describe('bucket routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stubFetch = () => {
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
  }

  const parseFetchBody = () => {
    const fetchCall = vi.mocked(fetch).mock.calls[0]
    return JSON.parse(fetchCall[1].body)
  }

  it('sends summary logs bucket for summary log uploads', async () => {
    stubFetch()

    const repository = createUploadsRepository({
      s3Client: { send: vi.fn() },
      ...testConfig
    })

    await repository.initiateSummaryLogUpload({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      summaryLogId: 'sl-1',
      redirectUrl: 'https://frontend.test/redirect',
      callbackUrl: 'https://backend.test/callback'
    })

    expect(parseFetchBody().s3Bucket).toBe('test-summary-logs-bucket')
  })

  it('sends only xlsx MIME type for summary log uploads', async () => {
    stubFetch()

    const repository = createUploadsRepository({
      s3Client: { send: vi.fn() },
      ...testConfig
    })

    await repository.initiateSummaryLogUpload({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      summaryLogId: 'sl-1',
      redirectUrl: 'https://frontend.test/redirect',
      callbackUrl: 'https://backend.test/callback'
    })

    expect(parseFetchBody().mimeTypes).toEqual([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ])
  })

  it('sends ORS bucket for ORS imports', async () => {
    stubFetch()

    const repository = createUploadsRepository({
      s3Client: { send: vi.fn() },
      ...testConfig
    })

    await repository.initiateOrsImport({
      importId: 'import-1',
      redirectUrl: 'https://admin.test/redirect',
      callbackUrl: 'https://backend.test/callback'
    })

    expect(parseFetchBody().s3Bucket).toBe('test-ors-bucket')
  })

  it('sends both xlsx and xlsm MIME types for ORS imports', async () => {
    stubFetch()

    const repository = createUploadsRepository({
      s3Client: { send: vi.fn() },
      ...testConfig
    })

    await repository.initiateOrsImport({
      importId: 'import-1',
      redirectUrl: 'https://admin.test/redirect',
      callbackUrl: 'https://backend.test/callback'
    })

    expect(parseFetchBody().mimeTypes).toEqual([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'application/vnd.ms-excel.sheet.macroenabled.12'
    ])
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

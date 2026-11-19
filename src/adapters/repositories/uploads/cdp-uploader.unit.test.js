import { afterEach, describe, it, expect, vi } from 'vitest'
import { assertPresent, partialMock } from '#test/type-helpers.js'
import { toUploadCallbackSignature } from '#common/helpers/auth/upload-callback-signature.js'
import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import {
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { createUploadsRepository } from './cdp-uploader.js'

const callback = {
  url: 'https://backend.test/callback',
  signature: toUploadCallbackSignature('abc123')
}

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = /** @type {Record<string, unknown>} */ (await importOriginal())
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
      s3Client: partialMock(mockS3Client),
      ...testConfig
    })

    await expect(
      repository.findByLocation('s3://test-summary-logs-bucket/test')
    ).rejects.toThrow(
      'S3 GetObject returned no body for s3://test-summary-logs-bucket/test'
    )
  })

  it('re-throws unexpected errors', async () => {
    const mockS3Client = {
      send: vi.fn().mockRejectedValue(new Error('Network error'))
    }

    const repository = createUploadsRepository({
      s3Client: partialMock(mockS3Client),
      ...testConfig
    })

    await expect(
      repository.findByLocation('s3://test-summary-logs-bucket/test')
    ).rejects.toThrow('Network error')
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
    assertPresent(fetchCall)
    return JSON.parse(/** @type {string} */ (fetchCall[1]?.body))
  }

  it('sends summary logs bucket for summary log uploads', async () => {
    stubFetch()

    const repository = createUploadsRepository({
      s3Client: partialMock({ send: vi.fn() }),
      ...testConfig
    })

    await repository.initiateSummaryLogUpload({
      organisationNumber: toOrganisationNumber('500001'),
      registrationNumber: toRegistrationNumber('R26ER5001180001PL'),
      summaryLogId: 'sl-1',
      redirectUrl: 'https://frontend.test/redirect',
      callback
    })

    expect(parseFetchBody()).toMatchObject({
      s3Bucket: 'test-summary-logs-bucket',
      s3Path: '/organisations/500001/registrations/R26ER5001180001PL'
    })
  })

  it('sends the callback signature in the ORS import metadata, not the callback url', async () => {
    stubFetch()

    const repository = createUploadsRepository({
      s3Client: partialMock({ send: vi.fn() }),
      ...testConfig
    })

    await repository.initiateOrsImport({
      importId: 'import-1',
      redirectUrl: 'https://admin.test/redirect',
      callback
    })

    expect(parseFetchBody()).toMatchObject({
      callback: 'https://backend.test/callback',
      metadata: { importId: 'import-1', signature: 'abc123' }
    })
  })

  it('sends only xlsx MIME type for summary log uploads', async () => {
    stubFetch()

    const repository = createUploadsRepository({
      s3Client: partialMock({ send: vi.fn() }),
      ...testConfig
    })

    await repository.initiateSummaryLogUpload({
      organisationNumber: toOrganisationNumber('500001'),
      registrationNumber: toRegistrationNumber('R26ER5001180001PL'),
      summaryLogId: 'sl-1',
      redirectUrl: 'https://frontend.test/redirect',
      callback
    })

    expect(parseFetchBody().mimeTypes).toEqual([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ])
  })

  it('sends ORS bucket for ORS imports', async () => {
    stubFetch()

    const repository = createUploadsRepository({
      s3Client: partialMock({ send: vi.fn() }),
      ...testConfig
    })

    await repository.initiateOrsImport({
      importId: 'import-1',
      redirectUrl: 'https://admin.test/redirect',
      callback
    })

    expect(parseFetchBody().s3Bucket).toBe('test-ors-bucket')
  })

  it('sends both xlsx and xlsm MIME types for ORS imports', async () => {
    stubFetch()

    const repository = createUploadsRepository({
      s3Client: partialMock({ send: vi.fn() }),
      ...testConfig
    })

    await repository.initiateOrsImport({
      importId: 'import-1',
      redirectUrl: 'https://admin.test/redirect',
      callback
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
      s3Client: partialMock(mockS3Client),
      ...testConfig
    })

    await repository.deleteByLocation(
      's3://test-summary-logs-bucket/path/to/file.xlsx'
    )

    expect(mockS3Client.send).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-summary-logs-bucket',
        Key: 'path/to/file.xlsx'
      })
    )
  })
})

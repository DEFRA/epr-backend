import Boom from '@hapi/boom'

import {
  CDP_FILE_STATUS,
  CDP_UPLOAD_STATUS,
  createCdpUploader
} from './status.js'

const { mockFetchJson } = vi.hoisted(() => ({
  mockFetchJson: vi.fn()
}))

vi.mock('#common/helpers/fetch-json.js', () => ({
  fetchJson: mockFetchJson
}))

describe('createCdpUploader', () => {
  let cdpUploader
  let logger
  const cdpUploaderUrl = 'https://cdp-uploader.test'

  beforeEach(() => {
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    }

    cdpUploader = createCdpUploader({
      cdpUploaderUrl,
      logger
    })
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('getUploadStatus', () => {
    const uploadId = 'upload-123'
    const GRACE_PERIOD_MS = 30_000

    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    describe('after grace period', () => {
      beforeEach(() => {
        // Advance past grace period so CDP calls are made
        cdpUploader.getUploadStatus(uploadId)
        vi.advanceTimersByTime(GRACE_PERIOD_MS + 1)
      })

      it('fetches status from CDP Uploader', async () => {
        const mockResponse = {
          uploadStatus: CDP_UPLOAD_STATUS.READY,
          form: {
            summaryLogUpload: {
              fileId: 'file-123',
              filename: 'test.xlsx',
              fileStatus: CDP_FILE_STATUS.COMPLETE
            }
          }
        }

        mockFetchJson.mockResolvedValue(mockResponse)

        const result = await cdpUploader.getUploadStatus(uploadId)

        expect(mockFetchJson).toHaveBeenCalledWith(
          `${cdpUploaderUrl}/status/${uploadId}`
        )
        expect(result).toEqual(mockResponse)
      })

      it('returns null and logs warning when fetch fails', async () => {
        const error = Boom.notFound('Upload not found')
        mockFetchJson.mockRejectedValue(error)

        const result = await cdpUploader.getUploadStatus(uploadId)

        expect(result).toBeNull()
        expect(logger.warn).toHaveBeenCalledWith({
          error,
          message: 'CDP Uploader status check failed',
          uploadId
        })
      })

      it('returns null and logs warning on network error', async () => {
        const error = Boom.internal('Network error')
        mockFetchJson.mockRejectedValue(error)

        const result = await cdpUploader.getUploadStatus(uploadId)

        expect(result).toBeNull()
        expect(logger.warn).toHaveBeenCalledWith({
          error,
          message: 'CDP Uploader status check failed',
          uploadId
        })
      })

      it('returns pending upload status', async () => {
        const mockResponse = {
          uploadStatus: CDP_UPLOAD_STATUS.PENDING
        }

        mockFetchJson.mockResolvedValue(mockResponse)

        const result = await cdpUploader.getUploadStatus(uploadId)

        expect(result).toEqual(mockResponse)
      })

      it('returns ready upload status with rejected file', async () => {
        const mockResponse = {
          uploadStatus: CDP_UPLOAD_STATUS.READY,
          form: {
            summaryLogUpload: {
              fileId: 'file-123',
              filename: 'virus.xlsx',
              fileStatus: CDP_FILE_STATUS.REJECTED,
              errorMessage: 'The selected file contains a virus'
            }
          },
          numberOfRejectedFiles: 1
        }

        mockFetchJson.mockResolvedValue(mockResponse)

        const result = await cdpUploader.getUploadStatus(uploadId)

        expect(result).toEqual(mockResponse)
      })

      it('fetches directly every time after grace period (no caching)', async () => {
        const response1 = { uploadStatus: CDP_UPLOAD_STATUS.PENDING }
        const response2 = { uploadStatus: CDP_UPLOAD_STATUS.READY }

        mockFetchJson
          .mockResolvedValueOnce(response1)
          .mockResolvedValueOnce(response2)

        const result1 = await cdpUploader.getUploadStatus(uploadId)
        const result2 = await cdpUploader.getUploadStatus(uploadId)

        expect(mockFetchJson).toHaveBeenCalledTimes(2)
        expect(result1).toEqual(response1)
        expect(result2).toEqual(response2)
      })
    })

    describe('grace period', () => {
      it('returns null during grace period without calling CDP', async () => {
        const result = await cdpUploader.getUploadStatus(uploadId)

        expect(result).toBeNull()
        expect(mockFetchJson).not.toHaveBeenCalled()
      })

      it('tracks different uploadIds separately', async () => {
        const uploadId1 = 'upload-111'
        const uploadId2 = 'upload-222'

        // First uploadId - start grace period
        await cdpUploader.getUploadStatus(uploadId1)

        // Advance 20 seconds (still within grace period for uploadId1)
        vi.advanceTimersByTime(20_000)

        // Second uploadId - start its own grace period
        await cdpUploader.getUploadStatus(uploadId2)

        // Advance 15 seconds (uploadId1 now past 35s, uploadId2 at 15s)
        vi.advanceTimersByTime(15_000)

        mockFetchJson.mockResolvedValue({
          uploadStatus: CDP_UPLOAD_STATUS.READY
        })

        // uploadId1 should now call CDP (past grace period)
        const result1 = await cdpUploader.getUploadStatus(uploadId1)
        expect(mockFetchJson).toHaveBeenCalledTimes(1)
        expect(result1).not.toBeNull()

        // uploadId2 should still be in grace period
        const result2 = await cdpUploader.getUploadStatus(uploadId2)
        expect(mockFetchJson).toHaveBeenCalledTimes(1) // Still 1, not called again
        expect(result2).toBeNull()
      })

      it('calls CDP after grace period expires', async () => {
        const mockResponse = { uploadStatus: CDP_UPLOAD_STATUS.READY }
        mockFetchJson.mockResolvedValue(mockResponse)

        // First call - starts grace period, returns null
        const result1 = await cdpUploader.getUploadStatus(uploadId)
        expect(result1).toBeNull()
        expect(mockFetchJson).not.toHaveBeenCalled()

        // Advance past grace period
        vi.advanceTimersByTime(GRACE_PERIOD_MS + 1)

        // Second call - should now call CDP
        const result2 = await cdpUploader.getUploadStatus(uploadId)
        expect(result2).toEqual(mockResponse)
        expect(mockFetchJson).toHaveBeenCalledTimes(1)
      })
    })
  })
})

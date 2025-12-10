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

describe('CDP Uploader status constants', () => {
  it('exports upload status values', () => {
    expect(CDP_UPLOAD_STATUS.PENDING).toBe('pending')
    expect(CDP_UPLOAD_STATUS.READY).toBe('ready')
  })

  it('exports file status values', () => {
    expect(CDP_FILE_STATUS.COMPLETE).toBe('complete')
    expect(CDP_FILE_STATUS.REJECTED).toBe('rejected')
  })
})

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
  })
})

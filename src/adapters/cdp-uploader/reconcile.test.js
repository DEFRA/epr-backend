import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'

import { CDP_FILE_STATUS, CDP_UPLOAD_STATUS } from './status.js'
import { getCdpUploaderState, reconcileWithCdpUploader } from './reconcile.js'

describe('getCdpUploaderState', () => {
  let mockCdpUploader

  beforeEach(() => {
    mockCdpUploader = {
      getUploadStatus: vi.fn()
    }
  })

  it('returns null when CDP Uploader is unavailable', async () => {
    mockCdpUploader.getUploadStatus.mockResolvedValue(null)

    const result = await getCdpUploaderState('upload-123', mockCdpUploader)

    expect(result).toBeNull()
  })

  it('extracts file status from CDP response', async () => {
    mockCdpUploader.getUploadStatus.mockResolvedValue({
      uploadStatus: CDP_UPLOAD_STATUS.READY,
      form: {
        summaryLogUpload: {
          fileId: 'file-123',
          fileStatus: CDP_FILE_STATUS.COMPLETE
        }
      }
    })

    const result = await getCdpUploaderState('upload-123', mockCdpUploader)

    expect(result).toEqual({
      uploadStatus: CDP_UPLOAD_STATUS.READY,
      fileStatus: CDP_FILE_STATUS.COMPLETE,
      errorMessage: undefined
    })
  })

  it('extracts error message for rejected files', async () => {
    mockCdpUploader.getUploadStatus.mockResolvedValue({
      uploadStatus: CDP_UPLOAD_STATUS.READY,
      form: {
        summaryLogUpload: {
          fileId: 'file-123',
          fileStatus: CDP_FILE_STATUS.REJECTED,
          errorMessage: 'The selected file contains a virus'
        }
      }
    })

    const result = await getCdpUploaderState('upload-123', mockCdpUploader)

    expect(result).toEqual({
      uploadStatus: CDP_UPLOAD_STATUS.READY,
      fileStatus: CDP_FILE_STATUS.REJECTED,
      errorMessage: 'The selected file contains a virus'
    })
  })

  it('returns null fileStatus when form has no file field', async () => {
    mockCdpUploader.getUploadStatus.mockResolvedValue({
      uploadStatus: CDP_UPLOAD_STATUS.READY,
      form: {}
    })

    const result = await getCdpUploaderState('upload-123', mockCdpUploader)

    expect(result).toEqual({
      uploadStatus: CDP_UPLOAD_STATUS.READY,
      fileStatus: null,
      errorMessage: undefined
    })
  })

  it('returns null fileStatus when form is missing', async () => {
    mockCdpUploader.getUploadStatus.mockResolvedValue({
      uploadStatus: CDP_UPLOAD_STATUS.PENDING
    })

    const result = await getCdpUploaderState('upload-123', mockCdpUploader)

    expect(result).toEqual({
      uploadStatus: CDP_UPLOAD_STATUS.PENDING,
      fileStatus: null,
      errorMessage: undefined
    })
  })
})

describe('reconcileWithCdpUploader', () => {
  const summaryLogId = 'summary-log-123'
  const uploadId = 'upload-123'
  let mockCdpUploader
  let mockSummaryLogsRepository

  beforeEach(() => {
    mockCdpUploader = {
      getUploadStatus: vi.fn()
    }
    mockSummaryLogsRepository = {
      findById: vi.fn(),
      update: vi.fn()
    }
  })

  describe('when CDP status is not ready for reconciliation', () => {
    it('returns null when CDP is unavailable', async () => {
      mockCdpUploader.getUploadStatus.mockResolvedValue(null)

      const result = await reconcileWithCdpUploader({
        summaryLogId,
        uploadId,
        summaryLogsRepository: mockSummaryLogsRepository,
        cdpUploader: mockCdpUploader
      })

      expect(result).toBeNull()
      expect(mockSummaryLogsRepository.findById).not.toHaveBeenCalled()
    })

    it('returns null when upload is still pending', async () => {
      mockCdpUploader.getUploadStatus.mockResolvedValue({
        uploadStatus: CDP_UPLOAD_STATUS.PENDING
      })

      const result = await reconcileWithCdpUploader({
        summaryLogId,
        uploadId,
        summaryLogsRepository: mockSummaryLogsRepository,
        cdpUploader: mockCdpUploader
      })

      expect(result).toBeNull()
      expect(mockSummaryLogsRepository.findById).not.toHaveBeenCalled()
    })

    it('returns null when upload is ready but has no file status', async () => {
      mockCdpUploader.getUploadStatus.mockResolvedValue({
        uploadStatus: CDP_UPLOAD_STATUS.READY,
        form: {}
      })

      const result = await reconcileWithCdpUploader({
        summaryLogId,
        uploadId,
        summaryLogsRepository: mockSummaryLogsRepository,
        cdpUploader: mockCdpUploader
      })

      expect(result).toBeNull()
      expect(mockSummaryLogsRepository.findById).not.toHaveBeenCalled()
    })
  })

  describe('when CDP status is ready for reconciliation', () => {
    beforeEach(() => {
      mockCdpUploader.getUploadStatus.mockResolvedValue({
        uploadStatus: CDP_UPLOAD_STATUS.READY,
        form: {
          summaryLogUpload: {
            fileId: 'file-123',
            fileStatus: CDP_FILE_STATUS.COMPLETE
          }
        }
      })
    })

    it('returns null when summary log is not found', async () => {
      mockSummaryLogsRepository.findById.mockResolvedValue(null)

      const result = await reconcileWithCdpUploader({
        summaryLogId,
        uploadId,
        summaryLogsRepository: mockSummaryLogsRepository,
        cdpUploader: mockCdpUploader
      })

      expect(result).toBeNull()
      expect(mockSummaryLogsRepository.update).not.toHaveBeenCalled()
    })

    it('returns current summary log without update when status is no longer preprocessing', async () => {
      const currentSummaryLog = {
        status: SUMMARY_LOG_STATUS.VALIDATING,
        file: { id: 'file-123', name: 'test.xlsx' }
      }
      mockSummaryLogsRepository.findById.mockResolvedValue({
        version: 2,
        summaryLog: currentSummaryLog
      })

      const result = await reconcileWithCdpUploader({
        summaryLogId,
        uploadId,
        summaryLogsRepository: mockSummaryLogsRepository,
        cdpUploader: mockCdpUploader
      })

      expect(result).toEqual(currentSummaryLog)
      expect(mockSummaryLogsRepository.update).not.toHaveBeenCalled()
    })

    it('marks as validation_failed when file is complete but callback was missed', async () => {
      mockSummaryLogsRepository.findById.mockResolvedValue({
        version: 1,
        summaryLog: { status: SUMMARY_LOG_STATUS.PREPROCESSING }
      })
      mockSummaryLogsRepository.update.mockResolvedValue(undefined)

      const result = await reconcileWithCdpUploader({
        summaryLogId,
        uploadId,
        summaryLogsRepository: mockSummaryLogsRepository,
        cdpUploader: mockCdpUploader
      })

      expect(result).toEqual({
        status: SUMMARY_LOG_STATUS.VALIDATION_FAILED
      })
      expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
        summaryLogId,
        1,
        { status: SUMMARY_LOG_STATUS.VALIDATION_FAILED }
      )
    })

    it('marks as rejected when file was rejected by CDP', async () => {
      mockCdpUploader.getUploadStatus.mockResolvedValue({
        uploadStatus: CDP_UPLOAD_STATUS.READY,
        form: {
          summaryLogUpload: {
            fileId: 'file-123',
            fileStatus: CDP_FILE_STATUS.REJECTED,
            errorMessage: 'The selected file contains a virus'
          }
        }
      })
      mockSummaryLogsRepository.findById.mockResolvedValue({
        version: 1,
        summaryLog: { status: SUMMARY_LOG_STATUS.PREPROCESSING }
      })
      mockSummaryLogsRepository.update.mockResolvedValue(undefined)

      const result = await reconcileWithCdpUploader({
        summaryLogId,
        uploadId,
        summaryLogsRepository: mockSummaryLogsRepository,
        cdpUploader: mockCdpUploader
      })

      expect(result.status).toBe(SUMMARY_LOG_STATUS.REJECTED)
      expect(result.validation.failures).toContainEqual(
        expect.objectContaining({ code: 'FILE_VIRUS_DETECTED' })
      )
      expect(mockSummaryLogsRepository.update).toHaveBeenCalledWith(
        summaryLogId,
        1,
        expect.objectContaining({
          status: SUMMARY_LOG_STATUS.REJECTED,
          validation: expect.any(Object)
        })
      )
    })
  })
})

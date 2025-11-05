import { vi, describe, it, expect, beforeEach } from 'vitest'
import { logFilesUploadedFromForms } from './log-form-file-uploads.js'

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()
const mockGetUploadedFileInfo = vi.fn()
const mockCreateFormSubmissionsRepository = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args)
  }
}))

vi.mock('#repositories/form-submissions/mongodb.js', () => ({
  createFormSubmissionsRepository: (...args) =>
    mockCreateFormSubmissionsRepository(...args)
}))

vi.mock('../forms-submission-data/get-file-upload-details.js', () => ({
  getUploadedFileInfo: (...args) => mockGetUploadedFileInfo(...args)
}))

describe('logFilesUploadedFromForms', () => {
  let mockServer
  let mockRepository

  beforeEach(() => {
    mockRepository = {
      findAllRegistrations: vi.fn(),
      findAllAccreditations: vi.fn()
    }

    mockServer = {
      db: { collection: vi.fn() },
      featureFlags: {
        isLogFileUploadsFromFormsEnabled: vi.fn()
      }
    }

    mockCreateFormSubmissionsRepository.mockReturnValue(() => mockRepository)
    mockLoggerInfo.mockClear()
    mockLoggerError.mockClear()
    mockGetUploadedFileInfo.mockClear()
  })

  it('should log files when feature flag is enabled', async () => {
    mockServer.featureFlags.isLogFileUploadsFromFormsEnabled.mockReturnValue(
      true
    )
    const mockFiles = [
      { formName: 'Form A', fileId: 'file-1', id: 'id-1' },
      { formName: 'Form B', fileId: 'file-2', id: 'id-2' }
    ]
    mockGetUploadedFileInfo.mockResolvedValue(mockFiles)

    await logFilesUploadedFromForms(mockServer)

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Starting logging of files uploaded from defra forms : true'
    )
    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Total files uploaded from registration and accreditation forms 2'
    )
    expect(mockLoggerInfo).toHaveBeenCalledWith('Form A,id-1,file-1')
    expect(mockLoggerInfo).toHaveBeenCalledWith('Form B,id-2,file-2')
  })

  it('should skip logging when feature flag is disabled', async () => {
    mockServer.featureFlags.isLogFileUploadsFromFormsEnabled.mockReturnValue(
      false
    )

    await logFilesUploadedFromForms(mockServer)

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Feature flag disabled, skipping logging of files uploaded from defra forms'
    )
    expect(mockGetUploadedFileInfo).not.toHaveBeenCalled()
  })

  it('should catch and log errors', async () => {
    mockServer.featureFlags.isLogFileUploadsFromFormsEnabled.mockReturnValue(
      true
    )
    const mockError = new Error('Test error')
    mockGetUploadedFileInfo.mockRejectedValue(mockError)

    await logFilesUploadedFromForms(mockServer)

    expect(mockLoggerError).toHaveBeenCalledWith(
      mockError,
      'Failed to run logging of files uploaded from defra forms'
    )
  })
})

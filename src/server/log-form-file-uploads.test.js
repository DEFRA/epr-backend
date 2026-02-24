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

vi.mock('#formsubmission/parsing-common/get-file-upload-details.js', () => ({
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
      { formName: 'Form A', fileId: 'file-1', id: 'id-1', orgId: 500000 },
      { formName: 'Form B', fileId: 'file-2', id: 'id-2', orgId: 500001 }
    ]
    mockGetUploadedFileInfo.mockResolvedValue(mockFiles)

    await logFilesUploadedFromForms(mockServer)

    expect(mockLoggerInfo).toHaveBeenCalledWith({
      message: 'Starting logging of files uploaded from defra forms : true'
    })
    expect(mockLoggerInfo).toHaveBeenCalledWith({
      message:
        'Total files uploaded from registration and accreditation forms: 2'
    })
    // Only 2 log calls: feature flag status + total count (no per-file dumps)
    expect(mockLoggerInfo).toHaveBeenCalledTimes(2)
  })

  it('should skip logging when feature flag is disabled', async () => {
    mockServer.featureFlags.isLogFileUploadsFromFormsEnabled.mockReturnValue(
      false
    )

    await logFilesUploadedFromForms(mockServer)

    expect(mockLoggerInfo).toHaveBeenCalledWith({
      message:
        'Feature flag disabled, skipping logging of files uploaded from defra forms'
    })
    expect(mockGetUploadedFileInfo).not.toHaveBeenCalled()
  })

  it('should catch and log errors', async () => {
    mockServer.featureFlags.isLogFileUploadsFromFormsEnabled.mockReturnValue(
      true
    )
    const mockError = new Error('Test error')
    mockGetUploadedFileInfo.mockRejectedValue(mockError)

    await logFilesUploadedFromForms(mockServer)

    expect(mockLoggerError).toHaveBeenCalledWith({
      err: mockError,
      message: 'Failed to run logging of files uploaded from defra forms'
    })
  })
})

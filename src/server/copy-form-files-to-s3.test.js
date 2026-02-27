import { describe, it, expect, vi, beforeEach } from 'vitest'
import { copyFormFilesToS3 } from './copy-form-files-to-s3.js'

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()
const mockCreateS3Client = vi.fn()
const mockCreateFormsFileUploadsRepository = vi.fn()
const mockCreateFormSubmissionsRepository = vi.fn()
const mockCopyAllFormFilesToS3 = vi.fn()
const mockConfigGet = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args)
  }
}))

vi.mock('#common/helpers/s3/s3-client.js', () => ({
  createS3Client: (...args) => mockCreateS3Client(...args)
}))

vi.mock(
  '#adapters/repositories/forms-submissions/forms-file-uploads.js',
  () => ({
    createFormsFileUploadsRepository: (...args) =>
      mockCreateFormsFileUploadsRepository(...args)
  })
)

vi.mock('#repositories/form-submissions/mongodb.js', () => ({
  createFormSubmissionsRepository: (...args) =>
    mockCreateFormSubmissionsRepository(...args)
}))

vi.mock('#formsubmission/file-uploads/copy-files-to-s3.js', () => ({
  copyAllFormFilesToS3: (...args) => mockCopyAllFormFilesToS3(...args)
}))

vi.mock('../config.js', () => ({
  config: {
    get: (...args) => mockConfigGet(...args)
  }
}))

describe('copyFormFilesToS3', () => {
  let mockServer
  let mockFeatureFlags
  let mockLock
  let mockS3Client
  let mockFormSubmissionsRepository
  let mockFormsFileUploadsRepository

  beforeEach(() => {
    vi.clearAllMocks()

    mockS3Client = {}
    mockFormSubmissionsRepository = {}
    mockFormsFileUploadsRepository = {}

    mockLock = {
      free: vi.fn().mockResolvedValue(undefined)
    }

    mockFeatureFlags = {
      isCopyFormFilesToS3Enabled: vi.fn()
    }

    mockServer = {
      db: {},
      featureFlags: mockFeatureFlags,
      locker: {
        lock: vi.fn().mockResolvedValue(mockLock)
      }
    }

    mockCreateS3Client.mockReturnValue(mockS3Client)
    mockCreateFormSubmissionsRepository.mockResolvedValue(
      () => mockFormSubmissionsRepository
    )
    mockCreateFormsFileUploadsRepository.mockReturnValue(
      mockFormsFileUploadsRepository
    )
    mockConfigGet.mockImplementation((key) => {
      const config = {
        awsRegion: 'eu-west-2',
        s3Endpoint: 'http://localhost:4566',
        isDevelopment: true
      }
      return config[key]
    })
  })

  it('should copy files when feature flag is enabled', async () => {
    mockFeatureFlags.isCopyFormFilesToS3Enabled.mockReturnValue(true)
    mockCopyAllFormFilesToS3.mockResolvedValue(undefined)

    await copyFormFilesToS3(mockServer)

    expect(mockLoggerInfo).toHaveBeenCalledWith({
      message: 'Starting copy of form files to S3. Feature flag enabled: true'
    })

    expect(mockServer.locker.lock).toHaveBeenCalledWith('copy-form-files-to-s3')

    expect(mockCreateS3Client).toHaveBeenCalledWith({
      region: 'eu-west-2',
      endpoint: 'http://localhost:4566',
      forcePathStyle: true
    })

    expect(mockCopyAllFormFilesToS3).toHaveBeenCalled()

    expect(mockLoggerInfo).toHaveBeenCalledWith({
      message: 'Copy of form files to S3 completed successfully'
    })

    expect(mockLock.free).toHaveBeenCalled()
  })

  it('should skip copy when feature flag is disabled', async () => {
    mockFeatureFlags.isCopyFormFilesToS3Enabled.mockReturnValue(false)

    await copyFormFilesToS3(mockServer)

    expect(mockLoggerInfo).toHaveBeenCalledWith({
      message: 'Feature flag disabled, skipping copy of form files to S3'
    })

    expect(mockServer.locker.lock).not.toHaveBeenCalled()
    expect(mockCopyAllFormFilesToS3).not.toHaveBeenCalled()
  })

  it('should skip copy when unable to obtain lock', async () => {
    mockFeatureFlags.isCopyFormFilesToS3Enabled.mockReturnValue(true)
    mockServer.locker.lock.mockResolvedValue(null)

    await copyFormFilesToS3(mockServer)

    expect(mockLoggerInfo).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping copy of form files to S3'
    })

    expect(mockCopyAllFormFilesToS3).not.toHaveBeenCalled()
  })

  it('should use options.featureFlags when provided', async () => {
    const customFeatureFlags = {
      isCopyFormFilesToS3Enabled: vi.fn().mockReturnValue(false)
    }

    await copyFormFilesToS3(mockServer, { featureFlags: customFeatureFlags })

    expect(customFeatureFlags.isCopyFormFilesToS3Enabled).toHaveBeenCalled()
    expect(mockCopyAllFormFilesToS3).not.toHaveBeenCalled()
  })

  it('should handle errors gracefully and release lock', async () => {
    mockFeatureFlags.isCopyFormFilesToS3Enabled.mockReturnValue(true)
    const error = new Error('Copy failed')
    mockCopyAllFormFilesToS3.mockRejectedValue(error)

    await copyFormFilesToS3(mockServer)

    expect(mockLoggerError).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to copy form files to S3'
    })

    expect(mockLock.free).toHaveBeenCalled()
  })

  it('should handle errors when lock free fails', async () => {
    mockFeatureFlags.isCopyFormFilesToS3Enabled.mockReturnValue(true)
    const copyError = new Error('Copy failed')
    const lockError = new Error('Lock free failed')
    mockCopyAllFormFilesToS3.mockRejectedValue(copyError)
    mockLock.free.mockRejectedValue(lockError)

    await copyFormFilesToS3(mockServer)

    expect(mockLoggerError).toHaveBeenCalledWith({
      err: lockError,
      message: 'Failed to copy form files to S3'
    })
  })
})

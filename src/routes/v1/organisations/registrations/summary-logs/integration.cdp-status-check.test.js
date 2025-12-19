import { ObjectId } from 'mongodb'

import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import {
  NO_PRIOR_SUBMISSION,
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const organisationId = new ObjectId().toString()
const registrationId = new ObjectId().toString()

const buildGetUrl = (summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`

setupAuthContext({ organisationId, registrationId })

describe('CDP status check for stale preprocessing status', () => {
  const summaryLogId = 'summary-cdp-status-check'
  let summaryLogsRepositoryFactory
  let summaryLogsRepository
  let server
  let mockCdpUploader

  beforeEach(async () => {
    summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    }
    summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

    mockCdpUploader = {
      getUploadStatus: vi.fn()
    }

    const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

    server = await createTestServer({
      repositories: {
        summaryLogsRepository: summaryLogsRepositoryFactory,
        cdpUploader: mockCdpUploader
      },
      featureFlags
    })
  })

  describe('when status is preprocessing and uploadId is provided', () => {
    const uploadId = 'cdp-upload-123'

    beforeEach(async () => {
      // Create a summary log stuck in preprocessing (simulating missed callback)
      await summaryLogsRepository.insert(summaryLogId, {
        status: SUMMARY_LOG_STATUS.PREPROCESSING,
        organisationId,
        registrationId
      })
    })

    it('queries CDP status when uploadId is provided', async () => {
      mockCdpUploader.getUploadStatus.mockResolvedValue({
        uploadStatus: 'pending'
      })

      await server.inject({
        method: 'GET',
        url: `${buildGetUrl(summaryLogId)}?uploadId=${uploadId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(mockCdpUploader.getUploadStatus).toHaveBeenCalledWith(uploadId)
    })

    it('does not query CDP when uploadId is not provided', async () => {
      await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId),
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(mockCdpUploader.getUploadStatus).not.toHaveBeenCalled()
    })

    it('returns preprocessing status when CDP upload is still pending', async () => {
      mockCdpUploader.getUploadStatus.mockResolvedValue({
        uploadStatus: 'pending'
      })

      const response = await server.inject({
        method: 'GET',
        url: `${buildGetUrl(summaryLogId)}?uploadId=${uploadId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.PREPROCESSING)
    })

    it('marks as validation_failed when CDP shows file complete but callback was missed', async () => {
      mockCdpUploader.getUploadStatus.mockResolvedValue({
        uploadStatus: 'ready',
        form: {
          summaryLogUpload: {
            fileId: 'file-123',
            filename: 'test.xlsx',
            fileStatus: 'complete',
            s3Bucket: 'test-bucket',
            s3Key: 'path/to/file.xlsx'
          }
        }
      })

      const response = await server.inject({
        method: 'GET',
        url: `${buildGetUrl(summaryLogId)}?uploadId=${uploadId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATION_FAILED)
    })

    it('marks as rejected when CDP shows file was rejected', async () => {
      mockCdpUploader.getUploadStatus.mockResolvedValue({
        uploadStatus: 'ready',
        form: {
          summaryLogUpload: {
            fileId: 'file-123',
            filename: 'virus.xlsx',
            fileStatus: 'rejected',
            errorMessage: 'The selected file contains a virus'
          }
        },
        numberOfRejectedFiles: 1
      })

      const response = await server.inject({
        method: 'GET',
        url: `${buildGetUrl(summaryLogId)}?uploadId=${uploadId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.REJECTED)
    })

    it('persists rejected status with validation failure code', async () => {
      mockCdpUploader.getUploadStatus.mockResolvedValue({
        uploadStatus: 'ready',
        form: {
          summaryLogUpload: {
            fileId: 'file-123',
            filename: 'virus.xlsx',
            fileStatus: 'rejected',
            errorMessage: 'The selected file contains a virus'
          }
        },
        numberOfRejectedFiles: 1
      })

      await server.inject({
        method: 'GET',
        url: `${buildGetUrl(summaryLogId)}?uploadId=${uploadId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      // Wait for eventual consistency (in-memory repository uses setImmediate)
      await new Promise((resolve) => setImmediate(resolve))

      const { summaryLog } = await summaryLogsRepository.findById(summaryLogId)
      expect(summaryLog.status).toBe(SUMMARY_LOG_STATUS.REJECTED)
      expect(summaryLog.validation.failures).toContainEqual(
        expect.objectContaining({ code: 'FILE_VIRUS_DETECTED' })
      )
    })

    it('continues with current status when CDP is unavailable', async () => {
      mockCdpUploader.getUploadStatus.mockResolvedValue(null)

      const response = await server.inject({
        method: 'GET',
        url: `${buildGetUrl(summaryLogId)}?uploadId=${uploadId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.PREPROCESSING)
    })

    it('does not overwrite status if it changed between read and write (race condition)', async () => {
      // Simulate race condition:
      // 1. GET endpoint reads status as 'preprocessing'
      // 2. Callback arrives and updates status to 'validating'
      // 3. GET endpoint tries to write 'validation_failed' but status is no longer 'preprocessing'

      mockCdpUploader.getUploadStatus.mockImplementation(async () => {
        // Simulate the callback arriving while we're checking CDP
        // Update status to 'validating' before returning CDP result
        const { version } = await summaryLogsRepository.findById(summaryLogId)
        await summaryLogsRepository.update(summaryLogId, version, {
          status: SUMMARY_LOG_STATUS.VALIDATING,
          file: {
            id: 'file-123',
            name: 'test.xlsx',
            status: UPLOAD_STATUS.COMPLETE,
            uri: 's3://test-bucket/test.xlsx'
          }
        })

        // Wait for eventual consistency before returning
        await new Promise((resolve) => setImmediate(resolve))

        // Return CDP status showing file is complete (would normally trigger validation_failed)
        return {
          uploadStatus: 'ready',
          form: {
            summaryLogUpload: {
              fileId: 'file-123',
              filename: 'test.xlsx',
              fileStatus: 'complete',
              s3Bucket: 'test-bucket',
              s3Key: 'path/to/file.xlsx'
            }
          }
        }
      })

      const response = await server.inject({
        method: 'GET',
        url: `${buildGetUrl(summaryLogId)}?uploadId=${uploadId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      // Should return the current status (validating), NOT validation_failed
      expect(response.statusCode).toBe(200)
      const payload = JSON.parse(response.payload)
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATING)

      // Wait for eventual consistency
      await new Promise((resolve) => setImmediate(resolve))

      // Database should still show validating, not validation_failed
      const { summaryLog } = await summaryLogsRepository.findById(summaryLogId)
      expect(summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATING)
    })
  })

  describe('when status is not preprocessing', () => {
    const uploadId = 'cdp-upload-456'

    it('does not query CDP when status is validated', async () => {
      await summaryLogsRepository.insert(summaryLogId, {
        status: SUMMARY_LOG_STATUS.VALIDATED,
        organisationId,
        registrationId,
        file: {
          id: 'file-123',
          name: 'test.xlsx',
          status: UPLOAD_STATUS.COMPLETE,
          uri: 's3://test-bucket/test.xlsx'
        }
      })

      await server.inject({
        method: 'GET',
        url: `${buildGetUrl(summaryLogId)}?uploadId=${uploadId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(mockCdpUploader.getUploadStatus).not.toHaveBeenCalled()
    })

    it('does not query CDP when status is validating', async () => {
      // validating means the callback was received, so no need to check CDP
      await summaryLogsRepository.insert(summaryLogId, {
        status: SUMMARY_LOG_STATUS.VALIDATING,
        organisationId,
        registrationId,
        file: {
          id: 'file-123',
          name: 'test.xlsx',
          status: UPLOAD_STATUS.COMPLETE,
          uri: 's3://test-bucket/test.xlsx'
        },
        validatedAgainstSummaryLogId: NO_PRIOR_SUBMISSION
      })

      await server.inject({
        method: 'GET',
        url: `${buildGetUrl(summaryLogId)}?uploadId=${uploadId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(mockCdpUploader.getUploadStatus).not.toHaveBeenCalled()
    })

    it('does not query CDP when status is rejected', async () => {
      await summaryLogsRepository.insert(summaryLogId, {
        status: SUMMARY_LOG_STATUS.REJECTED,
        organisationId,
        registrationId,
        file: {
          id: 'file-123',
          name: 'test.xlsx',
          status: UPLOAD_STATUS.REJECTED
        }
      })

      await server.inject({
        method: 'GET',
        url: `${buildGetUrl(summaryLogId)}?uploadId=${uploadId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(mockCdpUploader.getUploadStatus).not.toHaveBeenCalled()
    })
  })

  describe('when summary log does not exist', () => {
    it('does not query CDP for non-existent summary log', async () => {
      const uploadId = 'cdp-upload-789'

      const response = await server.inject({
        method: 'GET',
        url: `${buildGetUrl('non-existent-id')}?uploadId=${uploadId}`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(200)
      expect(mockCdpUploader.getUploadStatus).not.toHaveBeenCalled()

      // Returns default preprocessing status
      const payload = JSON.parse(response.payload)
      expect(payload.status).toBe(SUMMARY_LOG_STATUS.PREPROCESSING)
    })
  })
})

describe('retrieving summary log with validation_failed status', () => {
  const summaryLogId = 'summary-validation-failed-status'
  let summaryLogsRepositoryFactory
  let summaryLogsRepository
  let server

  beforeEach(async () => {
    summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    }
    summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

    // Create a summary log with validation_failed status (simulating worker crash/timeout)
    await summaryLogsRepository.insert(summaryLogId, {
      status: SUMMARY_LOG_STATUS.VALIDATION_FAILED,
      organisationId,
      registrationId,
      file: {
        id: 'file-validation-failed-123',
        name: 'large-file.xlsx',
        status: UPLOAD_STATUS.COMPLETE,
        uri: 's3://test-bucket/large-file.xlsx'
      }
    })

    const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

    server = await createTestServer({
      repositories: {
        summaryLogsRepository: summaryLogsRepositoryFactory
      },
      featureFlags
    })
  })

  it('returns OK', async () => {
    const response = await server.inject({
      method: 'GET',
      url: buildGetUrl(summaryLogId),
      ...asStandardUser({ linkedOrgId: organisationId })
    })

    expect(response.statusCode).toBe(200)
  })

  it('returns validation_failed status', async () => {
    const response = await server.inject({
      method: 'GET',
      url: buildGetUrl(summaryLogId),
      ...asStandardUser({ linkedOrgId: organisationId })
    })

    const payload = JSON.parse(response.payload)
    expect(payload.status).toBe(SUMMARY_LOG_STATUS.VALIDATION_FAILED)
  })

  it('does not include loads for validation_failed status', async () => {
    const response = await server.inject({
      method: 'GET',
      url: buildGetUrl(summaryLogId),
      ...asStandardUser({ linkedOrgId: organisationId })
    })

    const payload = JSON.parse(response.payload)
    expect(payload.loads).toBeUndefined()
  })

  it('does not include accreditationNumber for validation_failed status', async () => {
    const response = await server.inject({
      method: 'GET',
      url: buildGetUrl(summaryLogId),
      ...asStandardUser({ linkedOrgId: organisationId })
    })

    const payload = JSON.parse(response.payload)
    expect(payload.accreditationNumber).toBeUndefined()
  })
})

import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { SUMMARY_LOG_STATUS, UPLOAD_STATUS } from '#domain/summary-log.js'
import { createInlineSummaryLogsValidator } from '#workers/summary-logs/inline.js'

const organisationId = 'org-123'
const registrationId = 'reg-456'

const createUploadPayload = (
  fileStatus,
  fileId,
  filename,
  includeS3 = true
) => ({
  uploadStatus: 'ready',
  metadata: {
    organisationId,
    registrationId
  },
  form: {
    summaryLogUpload: {
      fileId,
      filename,
      fileStatus,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contentLength: 12345,
      checksumSha256: 'abc123def456',
      detectedContentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ...(includeS3 && {
        s3Bucket: 'test-bucket',
        s3Key: `path/to/${filename}`
      })
    }
  },
  numberOfRejectedFiles: fileStatus === UPLOAD_STATUS.REJECTED ? 1 : 0
})

const buildGetUrl = (summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`

const buildPostUrl = (summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`

describe('Summary logs integration', () => {
  let server

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }

  beforeEach(async () => {
    const summaryLogsRepository = createInMemorySummaryLogsRepository(mockLogger)
    const summaryLogsValidator = createInlineSummaryLogsValidator(
      summaryLogsRepository
    )
    const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

    server = await createTestServer({
      repositories: {
        summaryLogsRepository: (logger) => summaryLogsRepository
      },
      workers: {
        summaryLogsValidator
      },
      featureFlags
    })
  })

  describe('retrieving summary log that has not been uploaded', () => {
    let response

    beforeEach(async () => {
      const summaryLogId = 'summary-999'

      response = await server.inject({
        method: 'GET',
        url: buildGetUrl(summaryLogId)
      })
    })

    it('returns OK', () => {
      expect(response.statusCode).toBe(200)
    })

    it('returns preprocessing status', () => {
      expect(JSON.parse(response.payload)).toEqual({
        status: SUMMARY_LOG_STATUS.PREPROCESSING
      })
    })
  })

  describe('marking upload as completed with valid file', () => {
    const summaryLogId = 'summary-789'
    const fileId = 'file-123'
    const filename = 'summary-log.xlsx'
    let uploadResponse

    beforeEach(async () => {
      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload(UPLOAD_STATUS.COMPLETE, fileId, filename)
      })
    })

    it('returns ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    it('logs completion with file location', () => {
      expect(server.loggerMocks.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `File upload completed: summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}, status=complete, s3Bucket=test-bucket, s3Key=path/to/${filename}`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
            reference: summaryLogId
          }
        })
      )
    })

    describe('retrieving summary log', () => {
      let response

      beforeEach(async () => {
        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId)
        })
      })

      it('returns OK', () => {
        expect(response.statusCode).toBe(200)
      })

      it('returns validating status', () => {
        expect(JSON.parse(response.payload)).toEqual({
          status: SUMMARY_LOG_STATUS.VALIDATING
        })
      })
    })
  })

  describe('marking upload as completed with rejected file', () => {
    const summaryLogId = 'summary-888'
    const fileId = 'file-789'
    const filename = 'virus.xlsx'
    let uploadResponse

    beforeEach(async () => {
      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload(
          UPLOAD_STATUS.REJECTED,
          fileId,
          filename,
          false
        )
      })
    })

    it('returns ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    it('logs completion', () => {
      expect(server.loggerMocks.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `File upload completed: summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}, status=rejected`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
            reference: summaryLogId
          }
        })
      )
    })

    describe('retrieving summary log', () => {
      let response

      beforeEach(async () => {
        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId)
        })
      })

      it('returns OK', () => {
        expect(response.statusCode).toBe(200)
      })

      it('returns rejected status with reason', () => {
        expect(JSON.parse(response.payload)).toEqual(
          expect.objectContaining({
            status: UPLOAD_STATUS.REJECTED,
            failureReason:
              'Something went wrong with your file upload. Please try again.'
          })
        )
      })
    })
  })

  describe('marking upload as completed with pending file', () => {
    const summaryLogId = 'summary-666'
    const fileId = 'file-555'
    const filename = 'pending-file.xlsx'
    let uploadResponse

    beforeEach(async () => {
      uploadResponse = await server.inject({
        method: 'POST',
        url: buildPostUrl(summaryLogId),
        payload: createUploadPayload(
          UPLOAD_STATUS.PENDING,
          fileId,
          filename,
          false
        )
      })
    })

    it('returns ACCEPTED', () => {
      expect(uploadResponse.statusCode).toBe(202)
    })

    it('logs completion', () => {
      expect(server.loggerMocks.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `File upload completed: summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}, status=pending`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
            reference: summaryLogId
          }
        })
      )
    })
  })
})

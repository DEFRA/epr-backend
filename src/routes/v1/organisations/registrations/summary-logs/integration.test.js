import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createSummaryLogsValidator } from '#application/summary-logs/validate.js'
import { setupAuthContext } from '#test/helpers/setup-auth-mocking.js'

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
  setupAuthContext()

  beforeEach(async () => {
    const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    }
    const uploadsRepository = createInMemoryUploadsRepository()
    const summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)

    const testOrg = buildOrganisation({
      registrations: [
        {
          id: registrationId,
          wasteRegistrationNumber: 'WRN-123',
          material: 'paper',
          wasteProcessingType: 'reprocessor',
          formSubmissionTime: new Date(),
          submittedToRegulator: 'ea'
        }
      ]
    })
    testOrg.id = organisationId

    const organisationsRepository = createInMemoryOrganisationsRepository([
      testOrg
    ])()

    const summaryLogExtractor = createInMemorySummaryLogExtractor({
      'file-123': {
        meta: {
          WASTE_REGISTRATION_NUMBER: {
            value: 'WRN-123',
            location: { sheet: 'Data', row: 1, column: 'B' }
          },
          SUMMARY_LOG_TYPE: {
            value: 'REPROCESSOR',
            location: { sheet: 'Data', row: 2, column: 'B' }
          },
          MATERIAL: {
            value: 'Paper_and_board',
            location: { sheet: 'Data', row: 3, column: 'B' }
          }
        },
        data: {}
      }
    })

    const validateSummaryLog = createSummaryLogsValidator({
      summaryLogsRepository,
      organisationsRepository,
      summaryLogExtractor
    })
    const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

    server = await createTestServer({
      repositories: {
        summaryLogsRepository: summaryLogsRepositoryFactory,
        uploadsRepository
      },
      workers: {
        summaryLogsValidator: { validate: validateSummaryLog }
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
        // Poll for validation to complete (inline validator is fire-and-forget)
        // Retry up to 10 times with 50ms delay between attempts (max 500ms total)
        let attempts = 0
        const maxAttempts = 10
        let status = SUMMARY_LOG_STATUS.VALIDATING

        while (
          status === SUMMARY_LOG_STATUS.VALIDATING &&
          attempts < maxAttempts
        ) {
          await new Promise((resolve) => setTimeout(resolve, 50))

          const checkResponse = await server.inject({
            method: 'GET',
            url: buildGetUrl(summaryLogId)
          })

          status = JSON.parse(checkResponse.payload).status
          attempts++
        }

        response = await server.inject({
          method: 'GET',
          url: buildGetUrl(summaryLogId)
        })
      })

      it('returns OK', () => {
        expect(response.statusCode).toBe(200)
      })

      it('returns validated status', () => {
        expect(JSON.parse(response.payload)).toEqual({
          status: SUMMARY_LOG_STATUS.VALIDATED
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

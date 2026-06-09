import { randomUUID } from 'node:crypto'

import { StatusCodes } from 'http-status-codes'

import {
  NO_PRIOR_SUBMISSION,
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createMockLogger } from '#test/mock-logger.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { summaryLogsUploadCompletedPath } from './post.js'

const mockRecordStatusTransition = vi.fn()

vi.mock('#common/helpers/metrics/summary-logs.js', () => ({
  summaryLogMetrics: {
    recordStatusTransition: (...args) => mockRecordStatusTransition(...args)
  }
}))

const organisationId = 'org-123'
const registrationId = 'reg-456'

const fileId = 'file-123'
const filename = 'test.xlsx'
const fileStatus = 'complete'
const s3Bucket = 'test-bucket'
const s3Key = 'test-key'

const createFileDetails = (overrides) => ({
  fileId: 'file-123',
  filename: 'test.xlsx',
  fileStatus: 'complete',
  s3Bucket: 'test-bucket',
  s3Key: 'test-key',
  ...overrides
})

const createUploadCompletedPayload = (overrides, orgId = organisationId) => ({
  uploadStatus: 'ready',
  metadata: {
    organisationId: orgId,
    registrationId
  },
  form: {
    summaryLogUpload: createFileDetails()
  },
  numberOfRejectedFiles: 0,
  ...overrides
})

const createPendingPayload = (
  fileId = 'file-pending-123',
  orgId = organisationId
) =>
  createUploadCompletedPayload(
    {
      form: {
        summaryLogUpload: createFileDetails({
          fileId,
          filename: 'scanning.xlsx',
          fileStatus: 'pending',
          s3Bucket: undefined,
          s3Key: undefined
        })
      }
    },
    orgId
  )

const createRejectedPayload = (
  fileId = 'file-rejected-123',
  orgId = organisationId
) =>
  createUploadCompletedPayload(
    {
      form: {
        summaryLogUpload: createFileDetails({
          fileId,
          filename: 'virus.xlsx',
          fileStatus: 'rejected',
          hasError: true,
          errorMessage: 'The selected file contains a virus',
          s3Bucket: undefined,
          s3Key: undefined
        })
      },
      numberOfRejectedFiles: 1
    },
    orgId
  )

const createCompletePayload = (
  fileId = 'file-complete-123',
  orgId = organisationId
) =>
  createUploadCompletedPayload(
    {
      form: {
        summaryLogUpload: createFileDetails({
          fileId,
          filename: 'test.xlsx',
          fileStatus: 'complete',
          s3Bucket: 'test-bucket',
          s3Key: 'test-key'
        })
      }
    },
    orgId
  )

const uploadCompletedUrl = (summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/upload-completed`

describe(`${summaryLogsUploadCompletedPath} route`, () => {
  // Mock OIDC servers are needed for server startup (auth plugin fetches configs)
  // but the route itself is unauthenticated.
  setupAuthContext()

  let server
  let summaryLogsRepository
  let summaryLogsWorker

  beforeAll(async () => {
    const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    summaryLogsRepository = summaryLogsRepositoryFactory(createMockLogger())

    summaryLogsWorker = {
      validate: vi.fn()
    }

    const featureFlags = createInMemoryFeatureFlags()

    server = await createTestServer({
      repositories: {
        summaryLogsRepository: summaryLogsRepositoryFactory
      },
      workers: {
        summaryLogsWorker
      },
      featureFlags
    })
  })

  afterEach(() => {
    server.loggerMocks.info.mockClear()
    server.loggerMocks.error.mockClear()
    server.loggerMocks.warn.mockClear()
    mockRecordStatusTransition.mockClear()

    vi.resetAllMocks()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('stores a validating summary log, validates it and records the side-effects when the file is accepted', async () => {
    const summaryLogId = randomUUID()

    const response = await server.inject({
      method: 'POST',
      url: uploadCompletedUrl(summaryLogId),
      payload: createCompletePayload(fileId)
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)

    const stored = await waitForVersion(summaryLogsRepository, summaryLogId, 1)
    expect(stored.summaryLog).toMatchObject({
      status: SUMMARY_LOG_STATUS.VALIDATING,
      organisationId,
      registrationId,
      validatedAgainstSummaryLogId: NO_PRIOR_SUBMISSION,
      file: {
        id: fileId,
        name: filename,
        status: fileStatus,
        uri: `s3://${s3Bucket}/${s3Key}`
      }
    })
    expect(stored.summaryLog.createdAt).toEqual(expect.any(String))
    expect(stored.summaryLog.expiresAt).toBeInstanceOf(Date)

    expect(summaryLogsWorker.validate).toHaveBeenCalledWith(summaryLogId)
    expect(mockRecordStatusTransition).toHaveBeenCalledWith({
      status: SUMMARY_LOG_STATUS.VALIDATING
    })
    expect(server.loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `File upload completed: summaryLogId=${summaryLogId}, fileId=${fileId}, filename=${filename}, status=${fileStatus}, s3Bucket=${s3Bucket}, s3Key=${s3Key}`,
        event: {
          category: 'server',
          action: 'request_success',
          reference: summaryLogId
        }
      })
    )
  })

  it('stores a rejected summary log without validating when the file is rejected', async () => {
    const summaryLogId = randomUUID()

    const response = await server.inject({
      method: 'POST',
      url: uploadCompletedUrl(summaryLogId),
      payload: createRejectedPayload('file-rejected-virus')
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)

    const stored = await waitForVersion(summaryLogsRepository, summaryLogId, 1)
    expect(stored.summaryLog).toMatchObject({
      status: SUMMARY_LOG_STATUS.REJECTED,
      organisationId,
      registrationId,
      file: {
        id: 'file-rejected-virus',
        status: UPLOAD_STATUS.REJECTED
      },
      validation: {
        failures: [{ code: 'FILE_VIRUS_DETECTED' }]
      }
    })
    expect(stored.summaryLog.file.uri).toBeUndefined()

    expect(summaryLogsWorker.validate).not.toHaveBeenCalled()
    expect(mockRecordStatusTransition).toHaveBeenCalledWith({
      status: SUMMARY_LOG_STATUS.REJECTED
    })
    expect(server.loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `File upload completed: summaryLogId=${summaryLogId}, fileId=file-rejected-virus, filename=virus.xlsx, status=${UPLOAD_STATUS.REJECTED}`,
        event: {
          category: 'server',
          action: 'request_success',
          reference: summaryLogId
        }
      })
    )
  })

  it('maps the uploader error message to a validation code on the stored rejection', async () => {
    const summaryLogId = randomUUID()

    const payload = createRejectedPayload('file-rejected-empty')
    payload.form.summaryLogUpload.errorMessage = 'The selected file is empty'

    await server.inject({
      method: 'POST',
      url: uploadCompletedUrl(summaryLogId),
      payload
    })

    const stored = await waitForVersion(summaryLogsRepository, summaryLogId, 1)
    expect(stored.summaryLog.validation).toEqual({
      failures: [{ code: 'FILE_EMPTY' }]
    })
  })

  it('stores a preprocessing summary log without validating when the file is still pending', async () => {
    const summaryLogId = randomUUID()

    const response = await server.inject({
      method: 'POST',
      url: uploadCompletedUrl(summaryLogId),
      payload: createPendingPayload('file-pending-scan')
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)

    const stored = await waitForVersion(summaryLogsRepository, summaryLogId, 1)
    expect(stored.summaryLog).toMatchObject({
      status: SUMMARY_LOG_STATUS.PREPROCESSING,
      organisationId,
      registrationId,
      file: {
        id: 'file-pending-scan',
        status: UPLOAD_STATUS.PENDING
      }
    })
    expect(stored.summaryLog).not.toHaveProperty('validatedAgainstSummaryLogId')

    expect(summaryLogsWorker.validate).not.toHaveBeenCalled()
    expect(mockRecordStatusTransition).toHaveBeenCalledWith({
      status: SUMMARY_LOG_STATUS.PREPROCESSING
    })
  })

  describe('payload validation', () => {
    it('returns 400 if payload is not an object', async () => {
      const response = await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(randomUUID()),
        payload: 'not-an-object'
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const body = JSON.parse(response.payload)
      expect(body.message).toMatch(/Invalid request payload JSON format/)
    })

    it('returns 422 if payload is null', async () => {
      const response = await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(randomUUID()),
        payload: null
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 if payload is missing form.summaryLogUpload', async () => {
      const response = await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(randomUUID()),
        payload: {
          uploadStatus: 'ready'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toContain('"form" is required')
    })

    it('returns 422 when file is complete but missing S3 info', async () => {
      const payload = createCompletePayload(fileId)
      delete payload.form.summaryLogUpload.s3Bucket
      delete payload.form.summaryLogUpload.s3Key

      const response = await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(randomUUID()),
        payload
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      const body = JSON.parse(response.payload)
      expect(body.message).toContain('s3Bucket')
    })
  })

  describe('state transitions', () => {
    it('allows preprocessing -> preprocessing when receiving multiple pending callbacks', async () => {
      const summaryLogId = randomUUID()

      const firstResponse = await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(summaryLogId),
        payload: createPendingPayload('file-pending-456')
      })

      expect(firstResponse.statusCode).toBe(StatusCodes.ACCEPTED)

      const secondResponse = await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(summaryLogId),
        payload: createPendingPayload('file-pending-456')
      })

      expect(secondResponse.statusCode).toBe(StatusCodes.ACCEPTED)

      const stored = await waitForVersion(
        summaryLogsRepository,
        summaryLogId,
        2
      )
      expect(stored.summaryLog.status).toBe(SUMMARY_LOG_STATUS.PREPROCESSING)
    })

    it('allows preprocessing -> validating, carrying the file through the transition', async () => {
      const summaryLogId = randomUUID()

      await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(summaryLogId),
        payload: createPendingPayload('file-pending-101')
      })

      const secondResponse = await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(summaryLogId),
        payload: createCompletePayload('file-complete-101')
      })

      expect(secondResponse.statusCode).toBe(StatusCodes.ACCEPTED)

      const stored = await waitForVersion(
        summaryLogsRepository,
        summaryLogId,
        2
      )
      expect(stored.summaryLog).toMatchObject({
        status: SUMMARY_LOG_STATUS.VALIDATING,
        file: {
          id: 'file-complete-101',
          status: fileStatus,
          uri: 's3://test-bucket/test-key'
        }
      })
    })

    it('allows preprocessing -> rejected transition', async () => {
      const summaryLogId = randomUUID()

      await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(summaryLogId),
        payload: createPendingPayload('file-pending-789')
      })

      const secondResponse = await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(summaryLogId),
        payload: createRejectedPayload('file-rejected-789')
      })

      expect(secondResponse.statusCode).toBe(StatusCodes.ACCEPTED)

      const stored = await waitForVersion(
        summaryLogsRepository,
        summaryLogId,
        2
      )
      expect(stored.summaryLog.status).toBe(SUMMARY_LOG_STATUS.REJECTED)
    })

    it('rejects validating -> preprocessing transition with a conflict and an error log', async () => {
      const summaryLogId = randomUUID()

      await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(summaryLogId),
        payload: createCompletePayload('file-complete-202')
      })

      const response = await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(summaryLogId),
        payload: createPendingPayload('file-pending-202')
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(server.loggerMocks.error).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `Cannot transition summary log from ${SUMMARY_LOG_STATUS.VALIDATING} to ${SUMMARY_LOG_STATUS.PREPROCESSING}`,
          event: {
            category: 'server',
            action: 'response_failure',
            reference: summaryLogId
          },
          http: {
            response: {
              status_code: StatusCodes.CONFLICT
            }
          }
        })
      )

      const stored = await summaryLogsRepository.findById(summaryLogId)
      expect(stored.summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATING)
    })

    it('rejects rejected -> validating transition with a conflict', async () => {
      const summaryLogId = randomUUID()

      await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(summaryLogId),
        payload: createRejectedPayload('file-rejected-505')
      })

      const response = await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(summaryLogId),
        payload: createCompletePayload('file-complete-505')
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)

      const stored = await summaryLogsRepository.findById(summaryLogId)
      expect(stored.summaryLog.status).toBe(SUMMARY_LOG_STATUS.REJECTED)
    })
  })

  describe('when the repository fails unexpectedly', () => {
    let failingServer
    const insertError = new Error('Database connection failed')

    beforeAll(async () => {
      const featureFlags = createInMemoryFeatureFlags()

      failingServer = await createTestServer({
        repositories: {
          summaryLogsRepository: () => ({
            findById: async () => null,
            findLatestSubmittedForOrgReg: async () => null,
            insert: async () => {
              throw insertError
            }
          })
        },
        workers: {
          summaryLogsWorker: { validate: vi.fn() }
        },
        featureFlags
      })
    })

    afterEach(() => {
      failingServer.loggerMocks.error.mockClear()
    })

    afterAll(async () => {
      await failingServer.stop()
    })

    it('returns 500 and logs the failure', async () => {
      const summaryLogId = randomUUID()

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      const response = await failingServer.inject({
        method: 'POST',
        url: uploadCompletedUrl(summaryLogId),
        payload: createCompletePayload(fileId)
      })

      consoleErrorSpy.mockRestore()

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      expect(failingServer.loggerMocks.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: insertError,
          message: `Failure on ${summaryLogsUploadCompletedPath}`,
          event: {
            category: 'server',
            action: 'response_failure'
          },
          http: {
            response: {
              status_code: StatusCodes.INTERNAL_SERVER_ERROR
            }
          }
        })
      )
    })
  })
})

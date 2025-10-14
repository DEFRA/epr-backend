import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { summaryLogsUploadCompletedPath } from './upload-completed.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs-repository.inmemory.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createTestServer } from '#common/test-helpers/create-test-server.js'

const url = summaryLogsUploadCompletedPath

const createFileDetails = (overrides) => ({
  fileId: 'file-123',
  filename: 'test.xlsx',
  fileStatus: 'complete',
  s3Bucket: 'test-bucket',
  s3Key: 'test-key',
  ...overrides
})

const createUploadCompletedPayload = (overrides) => ({
  uploadStatus: 'ready',
  metadata: {
    organisationId: 'org-123',
    registrationId: 'reg-456'
  },
  form: {
    file: createFileDetails()
  },
  numberOfRejectedFiles: 0,
  ...overrides
})

const createPendingPayload = (fileId = 'file-pending-123') =>
  createUploadCompletedPayload({
    form: {
      file: createFileDetails({
        fileId,
        filename: 'scanning.xlsx',
        fileStatus: 'pending',
        s3Bucket: undefined,
        s3Key: undefined
      })
    }
  })

const createRejectedPayload = (fileId = 'file-rejected-123') =>
  createUploadCompletedPayload({
    form: {
      file: createFileDetails({
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
  })

const createCompletePayload = (fileId = 'file-complete-123') =>
  createUploadCompletedPayload({
    form: {
      file: createFileDetails({
        fileId,
        filename: 'test.xlsx',
        fileStatus: 'complete',
        s3Bucket: 'test-bucket',
        s3Key: 'test-key'
      })
    }
  })

let server
const payload = createUploadCompletedPayload()

describe(`${url} route`, () => {
  beforeEach(async () => {
    server = await createTestServer({
      repositories: {
        summaryLogsRepository: createInMemorySummaryLogsRepository()
      },
      featureFlags: createInMemoryFeatureFlags({ summaryLogs: true })
    })
  })

  it('returns 202 when valid payload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/organisations/org-123/registrations/reg-456/summary-logs/summary-log-123/upload-completed',
      payload
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)

    expect(server.loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'File upload completed: summaryLogId=summary-log-123, fileId=file-123, filename=test.xlsx, status=complete, s3Bucket=test-bucket, s3Key=test-key',
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: 'summary-log-123'
        }
      })
    )
  })

  it('returns 400 if payload is not an object', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/organisations/org-123/registrations/reg-456/summary-logs/summary-log-123/upload-completed',
      payload: 'not-an-object'
    })

    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid request payload JSON format/)
  })

  it('returns 422 if payload is null', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/organisations/org-123/registrations/reg-456/summary-logs/summary-log-123/upload-completed',
      payload: null
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('returns 422 if payload is missing form.file', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/organisations/org-123/registrations/reg-456/summary-logs/summary-log-123/upload-completed',
      payload: {
        uploadStatus: 'ready'
      }
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toContain('"form" is required')
  })

  it('returns 409 if summary log already exists', async () => {
    const summaryLogId = 'existing-summary-log-123'

    const firstResponse = await server.inject({
      method: 'POST',
      url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
      payload
    })

    expect(firstResponse.statusCode).toBe(StatusCodes.ACCEPTED)

    const secondResponse = await server.inject({
      method: 'POST',
      url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
      payload
    })

    expect(secondResponse.statusCode).toBe(StatusCodes.CONFLICT)
  })

  it('returns 202 when file is rejected without S3 info', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/organisations/org-123/registrations/reg-456/summary-logs/rejected-summary-log-123/upload-completed',
      payload: createRejectedPayload()
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)

    expect(server.loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(
          /^File upload completed:.*status=rejected$/
        ),
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: 'rejected-summary-log-123'
        }
      })
    )
    expect(server.loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.not.stringContaining('s3Bucket')
      })
    )
  })

  it('returns 422 when file is complete but missing S3 info', async () => {
    const incompletePayload = {
      uploadStatus: 'ready',
      form: {
        file: {
          fileId: 'file-incomplete-123',
          filename: 'test.xlsx',
          fileStatus: 'complete'
        }
      }
    }

    const response = await server.inject({
      method: 'POST',
      url: '/v1/organisations/org-123/registrations/reg-456/summary-logs/incomplete-summary-log-123/upload-completed',
      payload: incompletePayload
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    const body = JSON.parse(response.payload)
    expect(body.message).toContain('s3Bucket')
  })

  it('returns 202 when file is pending without S3 info', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/organisations/org-123/registrations/reg-456/summary-logs/pending-summary-log-123/upload-completed',
      payload: createPendingPayload()
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)

    expect(server.loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(
          /^File upload completed:.*status=pending$/
        ),
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: 'pending-summary-log-123'
        }
      })
    )
    expect(server.loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.not.stringContaining('s3Bucket')
      })
    )
  })

  it('returns 500 if error is thrown', async () => {
    const statusCode = StatusCodes.INTERNAL_SERVER_ERROR
    const error = new Error('logging failed')
    server.loggerMocks.info.mockImplementationOnce(() => {
      throw error
    })

    const response = await server.inject({
      method: 'POST',
      url: '/v1/organisations/org-123/registrations/reg-456/summary-logs/error-summary-log-123/upload-completed',
      payload
    })

    expect(response.statusCode).toBe(statusCode)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(`An internal server error occurred`)
    expect(server.loggerMocks.error).toHaveBeenCalledWith({
      error,
      message: `Failure on ${summaryLogsUploadCompletedPath}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      },
      http: {
        response: {
          status_code: statusCode
        }
      }
    })
  })

  describe('state transitions', () => {
    describe('valid transitions', () => {
      it('allows preprocessing -> preprocessing when receiving multiple pending callbacks', async () => {
        const summaryLogId = 'multi-pending-log-123'

        const firstResponse = await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createPendingPayload('file-pending-456')
        })

        expect(firstResponse.statusCode).toBe(StatusCodes.ACCEPTED)

        const secondResponse = await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createPendingPayload('file-pending-456')
        })

        expect(secondResponse.statusCode).toBe(StatusCodes.ACCEPTED)
      })

      it('allows preprocessing -> rejected transition', async () => {
        const summaryLogId = 'preprocessing-to-rejected-123'

        const firstResponse = await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createPendingPayload('file-pending-789')
        })

        expect(firstResponse.statusCode).toBe(StatusCodes.ACCEPTED)

        const secondResponse = await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createRejectedPayload('file-rejected-789')
        })

        expect(secondResponse.statusCode).toBe(StatusCodes.ACCEPTED)
      })

      it('allows preprocessing -> validating transition', async () => {
        const summaryLogId = 'preprocessing-to-validating-123'

        const firstResponse = await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createPendingPayload('file-pending-101')
        })

        expect(firstResponse.statusCode).toBe(StatusCodes.ACCEPTED)

        const secondResponse = await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createCompletePayload('file-complete-101')
        })

        expect(secondResponse.statusCode).toBe(StatusCodes.ACCEPTED)
      })
    })

    describe('invalid transitions', () => {
      it('rejects validating -> preprocessing transition', async () => {
        const summaryLogId = 'validating-to-preprocessing-123'

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createCompletePayload('file-complete-202')
        })

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createPendingPayload('file-pending-202')
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })

      it('rejects validating -> rejected transition', async () => {
        const summaryLogId = 'validating-to-rejected-123'

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createCompletePayload('file-complete-303')
        })

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createRejectedPayload('file-rejected-303')
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })

      it('rejects rejected -> preprocessing transition', async () => {
        const summaryLogId = 'rejected-to-preprocessing-123'

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createRejectedPayload('file-rejected-404')
        })

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createPendingPayload('file-pending-404')
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })

      it('rejects rejected -> validating transition', async () => {
        const summaryLogId = 'rejected-to-validating-123'

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createRejectedPayload('file-rejected-505')
        })

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createCompletePayload('file-complete-505')
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })

      it('rejects validating -> validating transition (duplicate complete callbacks)', async () => {
        const summaryLogId = 'duplicate-complete-123'

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createCompletePayload('file-complete-606')
        })

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createCompletePayload('file-complete-606')
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })

      it('rejects rejected -> rejected transition (duplicate rejected callbacks)', async () => {
        const summaryLogId = 'duplicate-rejected-123'

        await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createRejectedPayload('file-rejected-707')
        })

        const response = await server.inject({
          method: 'POST',
          url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
          payload: createRejectedPayload('file-rejected-707')
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })
    })
  })
})

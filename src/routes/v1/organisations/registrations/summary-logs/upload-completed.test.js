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
const payload = {
  uploadStatus: 'ready',
  metadata: {
    organisationId: 'org-123',
    registrationId: 'reg-456'
  },
  form: {
    file: {
      fileId: 'file-123',
      filename: 'test.xlsx',
      fileStatus: 'complete',
      s3Bucket: 'test-bucket',
      s3Key: 'test-key'
    }
  },
  numberOfRejectedFiles: 0
}
let server

describe(`${url} route`, () => {
  beforeEach(async () => {
    server = await createTestServer({
      repositories: {
        summaryLogsRepository: createInMemorySummaryLogsRepository()
      },
      featureFlags: createInMemoryFeatureFlags({ summaryLogs: true })
    })
  })

  it('returns 200 when valid payload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/organisations/org-123/registrations/reg-456/summary-logs/summary-log-123/upload-completed',
      payload
    })

    expect(response.statusCode).toBe(StatusCodes.OK)

    expect(server.loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          'File upload completed for summaryLogId: summary-log-123'
        ),
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        },
        context: expect.objectContaining({
          summaryLogId: 'summary-log-123',
          fileId: 'file-123',
          filename: 'test.xlsx',
          fileStatus: 'complete',
          s3Bucket: 'test-bucket',
          s3Key: 'test-key'
        })
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

    expect(firstResponse.statusCode).toBe(StatusCodes.OK)

    const secondResponse = await server.inject({
      method: 'POST',
      url: `/v1/organisations/org-123/registrations/reg-456/summary-logs/${summaryLogId}/upload-completed`,
      payload
    })

    expect(secondResponse.statusCode).toBe(StatusCodes.CONFLICT)
    const body = JSON.parse(secondResponse.payload)
    expect(body.message).toContain(`Summary log ${summaryLogId} already exists`)
  })

  it('returns 200 when file is rejected without S3 info', async () => {
    const rejectedPayload = {
      uploadStatus: 'ready',
      metadata: {
        organisationId: 'org-123',
        registrationId: 'reg-456'
      },
      form: {
        file: {
          fileId: 'file-rejected-123',
          filename: 'virus.xlsx',
          fileStatus: 'rejected'
        }
      },
      numberOfRejectedFiles: 1
    }

    const response = await server.inject({
      method: 'POST',
      url: '/v1/organisations/org-123/registrations/reg-456/summary-logs/rejected-summary-log-123/upload-completed',
      payload: rejectedPayload
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
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

  it('returns 200 when file is pending without S3 info', async () => {
    const pendingPayload = {
      uploadStatus: 'ready',
      metadata: {
        organisationId: 'org-123',
        registrationId: 'reg-456'
      },
      form: {
        file: {
          fileId: 'file-pending-123',
          filename: 'scanning.xlsx',
          fileStatus: 'pending'
        }
      },
      numberOfRejectedFiles: 0
    }

    const response = await server.inject({
      method: 'POST',
      url: '/v1/organisations/org-123/registrations/reg-456/summary-logs/pending-summary-log-123/upload-completed',
      payload: pendingPayload
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
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
})

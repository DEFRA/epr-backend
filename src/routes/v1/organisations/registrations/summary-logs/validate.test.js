import { StatusCodes } from 'http-status-codes'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { summaryLogsValidatePath } from './validate.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createTestServer } from '#test/create-test-server.js'

const url = summaryLogsValidatePath
const payload = {
  s3Bucket: 'test-bucket',
  s3Key: 'test-key',
  fileId: 'test-file-id',
  filename: 'test-filename.xlsx'
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

  it('returns 202 and status', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)

    expect(server.loggerMocks.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.any(String),
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
        }
      })
    )
  })

  it('returns 400 if payload is not an object', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: 'not-an-object'
    })

    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid request payload JSON format/)
  })

  it('returns 400 if payload is null', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: null
    })

    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid payload/)
  })

  it.each([['s3Bucket'], ['s3Key'], ['fileId'], ['filename']])(
    'returns 422 if payload is missing %s',
    async (key) => {
      const response = await server.inject({
        method: 'POST',
        url,
        payload: {
          ...payload,
          [key]: undefined
        }
      })

      const body = JSON.parse(response.payload)

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      expect(body.message).toEqual(`${key} is missing in body.data`)
    }
  )

  it('returns 500 if error is thrown', async () => {
    const statusCode = StatusCodes.INTERNAL_SERVER_ERROR
    const error = new Error('logging failed')
    server.loggerMocks.info.mockImplementationOnce(() => {
      throw error
    })

    const response = await server.inject({
      method: 'POST',
      url,
      payload
    })

    expect(response.statusCode).toBe(statusCode)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(`An internal server error occurred`)
    expect(server.loggerMocks.error).toHaveBeenCalledWith({
      error,
      message: `Failure on ${summaryLogsValidatePath}`,
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

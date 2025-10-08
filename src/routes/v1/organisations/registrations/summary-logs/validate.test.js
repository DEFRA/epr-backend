import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { summaryLogsValidatePath } from './validate.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs-repository.inmemory.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createServer } from '#server/server.js'

const mockLoggerInfo = vi.fn()
const mockLoggerError = vi.fn()
const mockLoggerWarn = vi.fn()

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: (...args) => mockLoggerInfo(...args),
    error: (...args) => mockLoggerError(...args),
    warn: (...args) => mockLoggerWarn(...args)
  }
}))

const url = summaryLogsValidatePath
const payload = {
  s3Bucket: 'test-bucket',
  s3Key: 'test-key',
  fileId: 'test-file-id',
  filename: 'test-filename.xlsx'
}
let server

describe(`${url} route`, () => {
  beforeAll(async () => {
    server = await createServer({
      repositories: {
        summaryLogsRepository: createInMemorySummaryLogsRepository()
      },
      featureFlags: createInMemoryFeatureFlags({ summaryLogs: true })
    })
    await server.initialize()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 202 and status', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload
    })

    expect(response.statusCode).toBe(202)

    expect(mockLoggerInfo).toHaveBeenCalledWith(
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

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid request payload JSON format/)
  })

  it('returns 400 if payload is null', async () => {
    const response = await server.inject({
      method: 'POST',
      url,
      payload: null
    })

    expect(response.statusCode).toBe(400)
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

      expect(response.statusCode).toBe(422)
      expect(body.message).toEqual(`${key} is missing in body.data`)
    }
  )

  it('returns 500 if error is thrown', async () => {
    const statusCode = 500
    const error = new Error('logging failed')
    mockLoggerInfo.mockImplementationOnce(() => {
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
    expect(mockLoggerError).toHaveBeenCalledWith(error, {
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

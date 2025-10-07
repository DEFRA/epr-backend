import { summaryLogsUploadCompletedPath } from './upload-completed.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs-repository.inmemory.js'

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
  beforeAll(async () => {
    vi.stubEnv('FEATURE_FLAG_SUMMARY_LOGS', 'true')

    const { createServer } = await import('#server/server.js')
    server = await createServer({
      repositories: {
        summaryLogsRepository: createInMemorySummaryLogsRepository()
      }
    })
    await server.initialize()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 when valid payload', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/organisations/org-123/registrations/reg-456/summary-logs/summary-123/upload-completed',
      payload
    })

    expect(response.statusCode).toBe(200)
  })

  it('returns 400 if payload is not an object', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/organisations/org-123/registrations/reg-456/summary-logs/summary-123/upload-completed',
      payload: 'not-an-object'
    })

    expect(response.statusCode).toBe(400)
    const body = JSON.parse(response.payload)
    expect(body.message).toMatch(/Invalid request payload JSON format/)
  })

  it('returns 422 if payload is null', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/organisations/org-123/registrations/reg-456/summary-logs/summary-123/upload-completed',
      payload: null
    })

    expect(response.statusCode).toBe(422)
  })

  it('returns 422 if payload is missing form.file', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/organisations/org-123/registrations/reg-456/summary-logs/summary-123/upload-completed',
      payload: {
        uploadStatus: 'ready'
      }
    })

    expect(response.statusCode).toBe(422)
    const body = JSON.parse(response.payload)
    expect(body.message).toContain('"form" is required')
  })
})

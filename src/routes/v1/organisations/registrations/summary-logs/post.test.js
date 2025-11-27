import { StatusCodes } from 'http-status-codes'
import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach
} from 'vitest'

import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'

import { summaryLogsCreatePath } from './post.js'

const { validToken } = entraIdMockAuthTokens

const organisationId = 'org-123'
const registrationId = 'reg-456'

const createPayload = (overrides = {}) => ({
  mimeTypes: [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ],
  maxFileSize: 10485760,
  ...overrides
})

describe(`${summaryLogsCreatePath} route`, () => {
  setupAuthContext()
  let server
  let summaryLogsRepository
  const originalFetch = global.fetch

  const mockCdpResponse = {
    uploadId: 'cdp-upload-123',
    uploadUrl: '/upload-and-scan/cdp-upload-123',
    statusUrl: 'https://cdp-uploader.test/status/cdp-upload-123'
  }

  beforeAll(async () => {
    summaryLogsRepository = {
      insert: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(null)
    }

    const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

    server = await createTestServer({
      repositories: {
        summaryLogsRepository: () => summaryLogsRepository
      },
      featureFlags
    })

    await server.initialize()
  })

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockCdpResponse,
      headers: new Map()
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.resetAllMocks()
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('successful requests', () => {
    it('returns 201 with summary log and upload details', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        payload: createPayload(),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)

      const body = JSON.parse(response.payload)
      expect(body.summaryLogId).toBeDefined()
      expect(body.uploadId).toBe(mockCdpResponse.uploadId)
      expect(body.uploadUrl).toBe(mockCdpResponse.uploadUrl)
      expect(body.statusUrl).toBe(mockCdpResponse.statusUrl)
    })

    it('creates summary log with preprocessing status', async () => {
      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        payload: createPayload(),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(summaryLogsRepository.insert).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: SUMMARY_LOG_STATUS.PREPROCESSING,
          organisationId,
          registrationId
        })
      )
    })

    it('calls CDP Uploader with correct options', async () => {
      const payload = createPayload()

      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        payload,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/initiate'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"mimeTypes"')
        })
      )

      const fetchCall = global.fetch.mock.calls[0]
      const body = JSON.parse(fetchCall[1].body)
      expect(body.mimeTypes).toEqual(payload.mimeTypes)
      expect(body.maxFileSize).toBe(payload.maxFileSize)
      expect(body.metadata.summaryLogId).toBeDefined()
    })

    it('generates unique summaryLogId for each request', async () => {
      const responses = await Promise.all([
        server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
          payload: createPayload(),
          headers: { Authorization: `Bearer ${validToken}` }
        }),
        server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
          payload: createPayload(),
          headers: { Authorization: `Bearer ${validToken}` }
        })
      ])

      const ids = responses.map((r) => JSON.parse(r.payload).summaryLogId)
      expect(ids[0]).not.toBe(ids[1])
    })
  })

  describe('validation errors', () => {
    it('returns 422 when mimeTypes is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        payload: { maxFileSize: 10485760 },
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when mimeTypes is empty array', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        payload: createPayload({ mimeTypes: [] }),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('error handling', () => {
    it('returns 500 when repository insert fails', async () => {
      summaryLogsRepository.insert.mockRejectedValue(
        new Error('Database error')
      )

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        payload: createPayload(),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      consoleErrorSpy.mockRestore()

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })

    it('returns error when CDP Uploader fails', async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValue(new Error('CDP Uploader unavailable'))

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        payload: createPayload(),
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      consoleErrorSpy.mockRestore()

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })
  })
})

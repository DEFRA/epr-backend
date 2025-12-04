import { StatusCodes } from 'http-status-codes'
import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach
} from 'vitest'

import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { summaryLogsCreatePath } from './post.js'

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn()
}

const { validToken } = entraIdMockAuthTokens

const organisationId = 'org-123'
const registrationId = 'reg-456'

describe(`${summaryLogsCreatePath} route`, () => {
  setupAuthContext()

  describe('successful requests', () => {
    let server
    let summaryLogsRepository
    let uploadsRepository

    beforeAll(async () => {
      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      summaryLogsRepository = summaryLogsRepositoryFactory(mockLogger)
      uploadsRepository = createInMemoryUploadsRepository()

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: () => summaryLogsRepository,
          uploadsRepository
        },
        featureFlags: createInMemoryFeatureFlags({ summaryLogs: true })
      })

      await server.initialize()
    })

    afterEach(() => {
      uploadsRepository.initiateCalls.length = 0
    })

    afterAll(async () => {
      await server.stop()
    })

    it('returns 201 with summary log and upload details', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          redirectUrl: 'https://frontend.test/redirect'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)

      const body = JSON.parse(response.payload)
      expect(body.summaryLogId).toBeDefined()
      expect(body.uploadId).toBeDefined()
      expect(body.uploadUrl).toContain(body.uploadId)
      expect(body.statusUrl).toContain(body.uploadId)
    })

    it('creates summary log with preprocessing status', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          redirectUrl: 'https://frontend.test/redirect'
        }
      })

      const body = JSON.parse(response.payload)
      const stored = await summaryLogsRepository.findById(body.summaryLogId)

      expect(stored.summaryLog).toMatchObject({
        status: SUMMARY_LOG_STATUS.PREPROCESSING,
        organisationId,
        registrationId
      })
    })

    it('initiates upload via uploads repository', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          redirectUrl: 'https://frontend.test/redirect'
        }
      })

      const body = JSON.parse(response.payload)

      expect(uploadsRepository.initiateCalls).toHaveLength(1)
      expect(uploadsRepository.initiateCalls[0]).toEqual({
        organisationId,
        registrationId,
        summaryLogId: body.summaryLogId,
        redirectUrl: 'https://frontend.test/redirect',
        callbackUrl: `http://localhost:3001/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${body.summaryLogId}/upload-completed`
      })
    })

    it('generates unique summaryLogId for each request', async () => {
      const responses = await Promise.all([
        server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
          headers: { Authorization: `Bearer ${validToken}` },
          payload: { redirectUrl: 'https://frontend.test/redirect' }
        }),
        server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
          headers: { Authorization: `Bearer ${validToken}` },
          payload: { redirectUrl: 'https://frontend.test/redirect' }
        })
      ])

      const ids = responses.map((r) => JSON.parse(r.payload).summaryLogId)
      expect(ids[0]).not.toBe(ids[1])
    })
  })

  describe('error handling', () => {
    let server
    let summaryLogsRepository

    beforeAll(async () => {
      summaryLogsRepository = {
        insert: vi.fn().mockResolvedValue(undefined),
        update: vi.fn().mockResolvedValue(undefined),
        findById: vi.fn().mockResolvedValue(null)
      }

      server = await createTestServer({
        repositories: {
          summaryLogsRepository: () => summaryLogsRepository,
          uploadsRepository: createInMemoryUploadsRepository()
        },
        featureFlags: createInMemoryFeatureFlags({ summaryLogs: true })
      })

      await server.initialize()
    })

    afterEach(() => {
      vi.resetAllMocks()
    })

    afterAll(async () => {
      await server.stop()
    })

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
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          redirectUrl: 'https://frontend.test/redirect'
        }
      })

      consoleErrorSpy.mockRestore()

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })

    it('re-throws Boom errors with original status', async () => {
      const Boom = await import('@hapi/boom')
      summaryLogsRepository.insert.mockRejectedValue(
        Boom.default.forbidden('Access denied')
      )

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          redirectUrl: 'https://frontend.test/redirect'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })

  describe('payload validation', () => {
    let server

    beforeAll(async () => {
      server = await createTestServer({
        repositories: {
          summaryLogsRepository: () =>
            createInMemorySummaryLogsRepository()(mockLogger),
          uploadsRepository: createInMemoryUploadsRepository()
        },
        featureFlags: createInMemoryFeatureFlags({ summaryLogs: true })
      })

      await server.initialize()
    })

    afterAll(async () => {
      await server.stop()
    })

    it('returns 422 when redirectUrl is missing', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {}
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('accepts relative paths for redirectUrl', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        headers: {
          Authorization: `Bearer ${validToken}`
        },
        payload: {
          redirectUrl:
            '/organisations/org-123/registrations/reg-456/summary-logs/sl-789'
        }
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })
  })
})

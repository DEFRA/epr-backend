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
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'

import { summaryLogsCreatePath } from './post.js'

const { validToken } = entraIdMockAuthTokens

const organisationId = 'org-123'
const registrationId = 'reg-456'

describe(`${summaryLogsCreatePath} route`, () => {
  setupAuthContext()
  let server
  let summaryLogsRepository
  let uploadsRepository

  beforeAll(async () => {
    summaryLogsRepository = {
      insert: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      findById: vi.fn().mockResolvedValue(null)
    }

    uploadsRepository = createInMemoryUploadsRepository()

    const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

    server = await createTestServer({
      repositories: {
        summaryLogsRepository: () => summaryLogsRepository,
        uploadsRepository
      },
      featureFlags
    })

    await server.initialize()
  })

  afterEach(() => {
    vi.resetAllMocks()
    uploadsRepository.initiateCalls.length = 0
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('successful requests', () => {
    it('returns 201 with summary log and upload details', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        headers: {
          Authorization: `Bearer ${validToken}`
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
      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
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

    it('initiates upload via uploads repository', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      const body = JSON.parse(response.payload)

      expect(uploadsRepository.initiateCalls).toHaveLength(1)
      expect(uploadsRepository.initiateCalls[0]).toEqual({
        organisationId,
        registrationId,
        summaryLogId: body.summaryLogId
      })
    })

    it('generates unique summaryLogId for each request', async () => {
      const responses = await Promise.all([
        server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
          headers: { Authorization: `Bearer ${validToken}` }
        }),
        server.inject({
          method: 'POST',
          url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs`,
          headers: { Authorization: `Bearer ${validToken}` }
        })
      ])

      const ids = responses.map((r) => JSON.parse(r.payload).summaryLogId)
      expect(ids[0]).not.toBe(ids[1])
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
        headers: {
          Authorization: `Bearer ${validToken}`
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
        }
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })
})

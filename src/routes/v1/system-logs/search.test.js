import { StatusCodes } from 'http-status-codes'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'
import { randomUUID } from 'crypto'

const { validToken } = entraIdMockAuthTokens

describe('GET /v1/system-logs', () => {
  setupAuthContext()
  let server
  /** @type {import('#repositories/system-logs/port.js').SystemLogsRepository} */
  let systemLogsRepository

  beforeEach(async () => {
    const systemLogsRepositoryFactory = createSystemLogsRepository()
    systemLogsRepository = systemLogsRepositoryFactory(undefined)
    server = await createTestServer({
      repositories: {
        systemLogsRepository: systemLogsRepositoryFactory
      }
    })
  })

  const addSystemLog = async ({
    createdAt = new Date(),
    organisationId,
    id
  } = {}) => {
    const systemLog = {
      event: { category: 'test', subCategory: 'test', action: 'test' },
      context: {
        organisationId,
        ...(id !== undefined && { id })
      },
      createdAt,
      createdBy: {
        id: 'user-id',
        email: 'user@email.com',
        scope: []
      }
    }
    await systemLogsRepository.insert(systemLog)
  }

  const makeRequest = async ({ organisationId, cursor, limit } = {}) => {
    const params = new URLSearchParams()
    if (organisationId) params.set('organisationId', organisationId)
    if (cursor) params.set('cursor', cursor)
    if (limit !== undefined) params.set('limit', String(limit))

    const query = params.toString()
    return server.inject({
      method: 'GET',
      url: `/v1/system-logs${query ? `?${query}` : ''}`,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })
  }

  describe('happy path', () => {
    it('returns 200 with system logs filtered by provided organisation ID', async () => {
      const organisationId1 = randomUUID()
      const organisationId2 = randomUUID()

      await addSystemLog({ organisationId: organisationId1 })
      await addSystemLog({ organisationId: organisationId2 })

      const response = await makeRequest({ organisationId: organisationId1 })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toHaveLength(1)
      expect(result.hasMore).toBe(false)
    })

    it('returns system logs most recent first', async () => {
      const organisationId = randomUUID()

      await addSystemLog({
        organisationId,
        createdAt: new Date('2025-01-01'),
        id: 'id1'
      })
      await addSystemLog({
        organisationId,
        createdAt: new Date('2025-01-02'),
        id: 'id2'
      })

      const response = await makeRequest({ organisationId })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toHaveLength(2)
      expect(result.systemLogs[0].context.id).toEqual('id2')
      expect(result.systemLogs[1].context.id).toEqual('id1')
    })

    it('returns empty system logs for an organisation with no logs', async () => {
      const response = await makeRequest({ organisationId: randomUUID() })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toEqual([])
      expect(result.hasMore).toBe(false)
      expect(result).not.toHaveProperty('nextCursor')
    })

    it('includes Cache-Control header in successful response', async () => {
      const response = await makeRequest({ organisationId: randomUUID() })

      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })
  })

  describe('pagination', () => {
    it('returns paginated results with hasMore and nextCursor', async () => {
      const organisationId = randomUUID()

      for (let i = 1; i <= 5; i++) {
        await addSystemLog({ organisationId, id: `id${i}` })
      }

      const response = await makeRequest({ organisationId, limit: 2 })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toHaveLength(2)
      expect(result.hasMore).toBe(true)
      expect(result.nextCursor).toBeDefined()
    })

    it('returns subsequent pages when cursor is provided', async () => {
      const organisationId = randomUUID()

      for (let i = 1; i <= 3; i++) {
        await addSystemLog({ organisationId, id: `id${i}` })
      }

      const page1Response = await makeRequest({ organisationId, limit: 2 })
      const page1 = JSON.parse(page1Response.payload)

      expect(page1.systemLogs).toHaveLength(2)
      expect(page1.hasMore).toBe(true)

      const page2Response = await makeRequest({
        organisationId,
        limit: 2,
        cursor: page1.nextCursor
      })
      const page2 = JSON.parse(page2Response.payload)

      expect(page2.systemLogs).toHaveLength(1)
      expect(page2.hasMore).toBe(false)
      expect(page2).not.toHaveProperty('nextCursor')
    })

    it('does not include nextCursor when hasMore is false', async () => {
      const organisationId = randomUUID()

      await addSystemLog({ organisationId, id: 'id1' })

      const response = await makeRequest({ organisationId, limit: 10 })
      const result = JSON.parse(response.payload)

      expect(result.hasMore).toBe(false)
      expect(result).not.toHaveProperty('nextCursor')
    })

    it('returns hasMore false when limit exactly matches item count', async () => {
      const organisationId = randomUUID()

      for (let i = 1; i <= 3; i++) {
        await addSystemLog({ organisationId, id: `id${i}` })
      }

      const response = await makeRequest({ organisationId, limit: 3 })
      const result = JSON.parse(response.payload)

      expect(result.systemLogs).toHaveLength(3)
      expect(result.hasMore).toBe(false)
      expect(result).not.toHaveProperty('nextCursor')
    })

    it('uses default limit when none is provided', async () => {
      const organisationId = randomUUID()

      // Insert fewer items than the default limit
      for (let i = 1; i <= 3; i++) {
        await addSystemLog({ organisationId, id: `id${i}` })
      }

      const response = await makeRequest({ organisationId })
      const result = JSON.parse(response.payload)

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(result.systemLogs).toHaveLength(3)
      expect(result.hasMore).toBe(false)
    })
  })

  describe('validation', () => {
    it('returns 422 when organisationId is missing', async () => {
      const response = await makeRequest({})

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when limit is less than 1', async () => {
      const response = await makeRequest({
        organisationId: randomUUID(),
        limit: 0
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('silently caps limit at the maximum when exceeded', async () => {
      const organisationId = randomUUID()

      await addSystemLog({ organisationId, id: 'id1' })
      await addSystemLog({ organisationId, id: 'id2' })

      const response = await makeRequest({
        organisationId,
        limit: 1000
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toHaveLength(2)
    })

    it('returns 422 when limit is not an integer', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `/v1/system-logs?organisationId=${randomUUID()}&limit=abc`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when cursor is not a valid ObjectId hex string', async () => {
      const response = await makeRequest({
        organisationId: randomUUID(),
        cursor: 'not-a-valid-cursor'
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('error handling', () => {
    it('returns 500 when repository throws unexpected error', async () => {
      const failingFactory = () => ({
        insert: async () => {},
        findByOrganisationId: async () => {
          throw new Error('Database connection lost')
        }
      })

      const failingServer = await createTestServer({
        repositories: {
          systemLogsRepository: failingFactory
        }
      })

      const response = await failingServer.inject({
        method: 'GET',
        url: `/v1/system-logs?organisationId=${randomUUID()}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })

    it('passes through Boom errors from repository', async () => {
      const Boom = await import('@hapi/boom')
      const boomFactory = () => ({
        insert: async () => {},
        findByOrganisationId: async () => {
          throw Boom.default.notFound('Organisation not found')
        }
      })

      const boomServer = await createTestServer({
        repositories: {
          systemLogsRepository: boomFactory
        }
      })

      const response = await boomServer.inject({
        method: 'GET',
        url: `/v1/system-logs?organisationId=${randomUUID()}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => {
      return {
        method: 'GET',
        url: `/v1/system-logs?organisationId=${randomUUID()}`
      }
    },
    additionalExpectations: (response) => {
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    }
  })

  testOnlyServiceMaintainerCanAccess({
    server: () => server,
    makeRequest: async () => {
      return {
        method: 'GET',
        url: `/v1/system-logs?organisationId=${randomUUID()}`
      }
    }
  })
})

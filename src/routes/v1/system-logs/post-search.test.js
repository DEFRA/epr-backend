import { StatusCodes } from 'http-status-codes'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'
import { randomUUID } from 'crypto'

const { validToken } = entraIdMockAuthTokens

describe('POST /v1/system-logs/search', () => {
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
    email = 'user@email.com',
    subCategory = 'test',
    id
  } = {}) => {
    await systemLogsRepository.insert({
      event: { category: 'test', subCategory, action: 'test' },
      context: {
        ...(organisationId !== undefined && { organisationId }),
        ...(id !== undefined && { id })
      },
      createdAt,
      createdBy: {
        id: 'user-id',
        email,
        scope: []
      }
    })
  }

  const makeRequest = async (payload = {}) => {
    return server.inject({
      method: 'POST',
      url: '/v1/system-logs/search',
      payload,
      headers: {
        Authorization: `Bearer ${validToken}`
      }
    })
  }

  describe('happy path', () => {
    it('returns logs filtered by email', async () => {
      await addSystemLog({ email: 'alice@example.com', id: 1 })
      await addSystemLog({ email: 'bob@example.com', id: 2 })

      const response = await makeRequest({ email: 'alice@example.com' })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toHaveLength(1)
      expect(result.systemLogs[0].createdBy.email).toBe('alice@example.com')
    })

    it('returns logs filtered by sub-category', async () => {
      const email = 'alice@example.com'
      await addSystemLog({ email, subCategory: 'summary-log', id: 1 })
      await addSystemLog({ email, subCategory: 'epr-organisations', id: 2 })

      const response = await makeRequest({ email, subCategory: 'summary-log' })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toHaveLength(1)
      expect(result.systemLogs[0].event.subCategory).toBe('summary-log')
    })

    it('returns logs filtered by organisation ID', async () => {
      const organisationId = randomUUID()

      await addSystemLog({ organisationId, id: 1 })
      await addSystemLog({ organisationId: randomUUID(), id: 2 })

      const response = await makeRequest({ organisationId })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toHaveLength(1)
      expect(result.systemLogs[0].context.organisationId).toBe(organisationId)
    })

    it('returns logs matching combined filters', async () => {
      const organisationId = randomUUID()

      await addSystemLog({
        organisationId,
        email: 'alice@example.com',
        subCategory: 'summary-log',
        id: 1
      })
      await addSystemLog({
        organisationId,
        email: 'bob@example.com',
        subCategory: 'summary-log',
        id: 2
      })

      const response = await makeRequest({
        organisationId,
        email: 'alice@example.com',
        subCategory: 'summary-log'
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toHaveLength(1)
      expect(result.systemLogs[0].context.id).toBe(1)
    })

    it('returns empty result when no logs match', async () => {
      const response = await makeRequest({ email: 'nobody@example.com' })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toEqual([])
      expect(result.hasMore).toBe(false)
      expect(result).not.toHaveProperty('nextCursor')
    })

    it('includes Cache-Control header in successful response', async () => {
      const response = await makeRequest({ email: 'test@example.com' })

      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })

    it('trims whitespace from email', async () => {
      await addSystemLog({ email: 'alice@example.com', id: 1 })

      const response = await makeRequest({ email: '  alice@example.com  ' })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toHaveLength(1)
    })
  })

  describe('pagination', () => {
    it('returns paginated results with cursor', async () => {
      for (let i = 1; i <= 3; i++) {
        await addSystemLog({ email: 'alice@example.com', id: i })
      }

      const page1 = await makeRequest({
        email: 'alice@example.com',
        limit: 2
      })
      const result1 = JSON.parse(page1.payload)

      expect(result1.systemLogs).toHaveLength(2)
      expect(result1.hasMore).toBe(true)
      expect(result1.nextCursor).toBeDefined()

      const page2 = await makeRequest({
        email: 'alice@example.com',
        limit: 2,
        cursor: result1.nextCursor
      })
      const result2 = JSON.parse(page2.payload)

      expect(result2.systemLogs).toHaveLength(1)
      expect(result2.hasMore).toBe(false)
      expect(result2).not.toHaveProperty('nextCursor')
    })
  })

  describe('validation', () => {
    it('returns 422 when no filters are provided', async () => {
      const response = await makeRequest({})

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when only subCategory is provided', async () => {
      const response = await makeRequest({ subCategory: 'summary-log' })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when cursor is not a valid hex string', async () => {
      const response = await makeRequest({
        email: 'test@example.com',
        cursor: 'not-valid'
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when limit is less than 1', async () => {
      const response = await makeRequest({
        email: 'test@example.com',
        limit: 0
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('silently caps limit at the maximum when exceeded', async () => {
      await addSystemLog({ email: 'alice@example.com', id: 1 })

      const response = await makeRequest({
        email: 'alice@example.com',
        limit: 1000
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('error handling', () => {
    it('returns 500 when repository throws unexpected error', async () => {
      const failingFactory = () => ({
        insert: async () => {},
        find: async () => {
          throw new Error('Database connection lost')
        }
      })

      const failingServer = await createTestServer({
        repositories: {
          systemLogsRepository: failingFactory
        }
      })

      const response = await failingServer.inject({
        method: 'POST',
        url: '/v1/system-logs/search',
        payload: { email: 'test@example.com' },
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
        find: async () => {
          throw Boom.default.notFound('Not found')
        }
      })

      const boomServer = await createTestServer({
        repositories: {
          systemLogsRepository: boomFactory
        }
      })

      const response = await boomServer.inject({
        method: 'POST',
        url: '/v1/system-logs/search',
        payload: { email: 'test@example.com' },
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
        method: 'POST',
        url: '/v1/system-logs/search',
        payload: { email: 'test@example.com' }
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
        method: 'POST',
        url: '/v1/system-logs/search',
        payload: { email: 'test@example.com' }
      }
    }
  })
})

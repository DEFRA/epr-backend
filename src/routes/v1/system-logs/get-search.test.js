import { StatusCodes } from 'http-status-codes'
import { createSystemLogsRepository } from '#repositories/system-logs/inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { testInvalidTokenScenarios } from '#vite/helpers/test-invalid-token-scenarios.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { testOnlyServiceMaintainerCanAccess } from '#vite/helpers/test-invalid-roles-scenarios.js'
import { randomUUID } from 'crypto'

const { validToken } = entraIdMockAuthTokens

describe('GET /v1/system-logs/search', () => {
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
    userId = 'user-id',
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
      createdBy: { id: userId, email, scope: [] }
    })
  }

  const makeRequest = async (query = {}) => {
    const params = new URLSearchParams(
      Object.entries(query).map(([key, value]) => [key, String(value)])
    )
    return server.inject({
      method: 'GET',
      url: `/v1/system-logs/search?${params}`,
      headers: { Authorization: `Bearer ${validToken}` }
    })
  }

  describe('happy path', () => {
    it('returns logs filtered by userId', async () => {
      await addSystemLog({ userId: 'alice', id: 1 })
      await addSystemLog({ userId: 'bob', id: 2 })

      const response = await makeRequest({ userId: 'alice' })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toHaveLength(1)
      expect(result.systemLogs[0].createdBy.id).toBe('alice')
    })

    it('returns logs filtered by sub-category', async () => {
      await addSystemLog({ subCategory: 'summary-log', id: 1 })
      await addSystemLog({ subCategory: 'epr-organisations', id: 2 })

      const response = await makeRequest({ subCategory: 'summary-log' })

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
        userId: 'alice',
        subCategory: 'summary-log',
        id: 1
      })
      await addSystemLog({
        organisationId,
        userId: 'bob',
        subCategory: 'summary-log',
        id: 2
      })

      const response = await makeRequest({
        organisationId,
        userId: 'alice',
        subCategory: 'summary-log'
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toHaveLength(1)
      expect(result.systemLogs[0].context.id).toBe(1)
    })

    it('returns empty result when no logs match', async () => {
      const response = await makeRequest({ userId: 'nobody' })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toEqual([])
      expect(result.hasNext).toBe(false)
      expect(result.hasPrev).toBe(false)
      expect(result).not.toHaveProperty('nextCursor')
      expect(result).not.toHaveProperty('prevCursor')
    })

    it('includes Cache-Control header in successful response', async () => {
      const response = await makeRequest({ userId: 'test' })

      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })

    it('trims whitespace from userId', async () => {
      await addSystemLog({ userId: 'alice', id: 1 })

      const response = await makeRequest({ userId: '  alice  ' })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toHaveLength(1)
    })
  })

  describe('pagination', () => {
    it('paginates forward with a cursor', async () => {
      for (let i = 1; i <= 3; i++) {
        await addSystemLog({ userId: 'alice', id: i })
      }

      const page1 = await makeRequest({ userId: 'alice', limit: 2 })
      const result1 = JSON.parse(page1.payload)

      expect(result1.systemLogs).toHaveLength(2)
      expect(result1.hasNext).toBe(true)
      expect(result1.hasPrev).toBe(false)
      expect(result1.nextCursor).toBeDefined()

      const page2 = await makeRequest({
        userId: 'alice',
        limit: 2,
        cursor: result1.nextCursor,
        direction: 'next'
      })
      const result2 = JSON.parse(page2.payload)

      expect(result2.systemLogs).toHaveLength(1)
      expect(result2.hasNext).toBe(false)
      expect(result2.hasPrev).toBe(true)
      expect(result2.prevCursor).toBeDefined()
    })

    it('paginates backward with direction=prev', async () => {
      for (let i = 1; i <= 3; i++) {
        await addSystemLog({ userId: 'alice', id: i })
      }

      const page1 = await makeRequest({ userId: 'alice', limit: 2 })
      const result1 = JSON.parse(page1.payload)
      const page2 = await makeRequest({
        userId: 'alice',
        limit: 2,
        cursor: result1.nextCursor,
        direction: 'next'
      })
      const result2 = JSON.parse(page2.payload)

      const back = await makeRequest({
        userId: 'alice',
        limit: 2,
        cursor: result2.prevCursor,
        direction: 'prev'
      })
      const backResult = JSON.parse(back.payload)

      expect(backResult.systemLogs.map((log) => log.context.id)).toEqual(
        result1.systemLogs.map((log) => log.context.id)
      )
      expect(backResult.hasNext).toBe(true)
    })
  })

  describe('validation', () => {
    it('returns 422 when no filters are provided', async () => {
      const response = await server.inject({
        method: 'GET',
        url: '/v1/system-logs/search',
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when cursor is not a valid hex string', async () => {
      const response = await makeRequest({
        userId: 'test',
        cursor: 'not-valid'
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when direction is not next or prev', async () => {
      const response = await makeRequest({
        userId: 'test',
        cursor: 'abc123def456abc123def456',
        direction: 'sideways'
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when direction is provided without a cursor', async () => {
      const response = await makeRequest({ userId: 'test', direction: 'prev' })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when limit is less than 1', async () => {
      const response = await makeRequest({ userId: 'test', limit: 0 })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('silently caps limit at the maximum when exceeded', async () => {
      for (let i = 1; i <= 250; i++) {
        await addSystemLog({ userId: 'alice', id: i })
      }

      const response = await makeRequest({ userId: 'alice', limit: 1000 })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toHaveLength(200)
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
        repositories: { systemLogsRepository: failingFactory }
      })

      const response = await failingServer.inject({
        method: 'GET',
        url: '/v1/system-logs/search?userId=test',
        headers: { Authorization: `Bearer ${validToken}` }
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
        repositories: { systemLogsRepository: boomFactory }
      })

      const response = await boomServer.inject({
        method: 'GET',
        url: '/v1/system-logs/search?userId=test',
        headers: { Authorization: `Bearer ${validToken}` }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => ({
      method: 'GET',
      url: '/v1/system-logs/search?userId=test'
    }),
    additionalExpectations: (response) => {
      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    }
  })

  testOnlyServiceMaintainerCanAccess({
    server: () => server,
    makeRequest: async () => ({
      method: 'GET',
      url: '/v1/system-logs/search?userId=test'
    })
  })
})

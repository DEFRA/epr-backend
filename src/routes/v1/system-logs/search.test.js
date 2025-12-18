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
    id = undefined
  }) => {
    const systemLog = {
      event: { category: 'test', subCategory: 'test', action: 'test' },
      context: {
        organisationId,
        id
      },
      createdAt,
      createdBy: {
        id: 'user-id',
        email: 'user@email.com',
        scope: []
      }
    }
    systemLogsRepository.insert(systemLog)
  }

  describe('happy path', () => {
    const makeRequest = async (organisationId) => {
      return server.inject({
        method: 'GET',
        url: `/v1/system-logs?organisationId=${organisationId}`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })
    }

    it('returns 200 with system logs filtered. by provided organisation ID', async () => {
      const organisationId1 = randomUUID()
      const organisationId2 = randomUUID()

      await addSystemLog({ organisationId: organisationId1 })
      await addSystemLog({ organisationId: organisationId2 })

      const response = await makeRequest(organisationId1)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toHaveLength(1)
    })

    it('returns system logs most recent first', async () => {
      const organisationId = randomUUID()

      await addSystemLog({
        organisationId: organisationId,
        createdAt: new Date('2025-01-01'),
        id: 'id1'
      })
      await addSystemLog({
        organisationId: organisationId,
        createdAt: new Date('2025-01-02'),
        id: 'id2'
      })

      const response = await makeRequest(organisationId)

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result.systemLogs).toHaveLength(2)
      expect(result.systemLogs[0].context.id).toEqual('id2')
      expect(result.systemLogs[1].context.id).toEqual('id1')
    })

    it('includes Cache-Control header in successful response', async () => {
      const response = await makeRequest('organisation-id-001')

      expect(response.headers['cache-control']).toBe(
        'no-cache, no-store, must-revalidate'
      )
    })
  })

  describe('no query parameters supplied', () => {
    it('returns no system logs when queried without parameters', async () => {
      await addSystemLog({ organisationId: randomUUID() })
      await addSystemLog({ organisationId: randomUUID() })
      await addSystemLog({ organisationId: randomUUID() })

      const response = await server.inject({
        method: 'GET',
        url: '/v1/system-logs', // no query string
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const result = JSON.parse(response.payload)
      expect(result).toEqual({ systemLogs: [] })
    })
  })

  testInvalidTokenScenarios({
    server: () => server,
    makeRequest: async () => {
      return {
        method: 'GET',
        url: '/v1/system-logs'
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
        url: '/v1/system-logs'
      }
    }
  })
})

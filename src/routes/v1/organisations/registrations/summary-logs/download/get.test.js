import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'

import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import './get.js'

describe('GET /v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}/download', () => {
  setupAuthContext()

  const summaryLogId = new ObjectId().toString()
  const organisationId = new ObjectId().toString()
  const registrationId = new ObjectId().toString()

  const createServer = async (options = {}) => {
    const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    const summaryLogsRepository = summaryLogsRepositoryFactory({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    })

    const server = await createTestServer({
      repositories: {
        summaryLogsRepository: summaryLogsRepositoryFactory,
        ...options.repositories
      }
    })

    return { server, summaryLogsRepository }
  }

  const makeRequest = (server, logId = summaryLogId) =>
    server.inject({
      method: 'GET',
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${logId}/download`,
      ...asServiceMaintainer()
    })

  describe('when summary log exists and is submitted', () => {
    it('redirects to the download URL', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await summaryLogsRepository.insert(
        summaryLogId,
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          file: { uri: 's3://re-ex-summary-logs/uploads/test-file.xlsx' }
        })
      )

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY)
      expect(response.headers.location).toContain('re-ex-summary-logs')
      expect(response.headers.location).toContain('uploads/test-file.xlsx')
    })
  })

  describe('when summary log does not exist', () => {
    it('returns 404', async () => {
      const { server } = await createServer()
      const nonExistentId = new ObjectId().toString()

      const response = await makeRequest(server, nonExistentId)

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('when summary log has no file URI', () => {
    it('returns 404 for preprocessing status', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await summaryLogsRepository.insert(
        summaryLogId,
        summaryLogFactory.preprocessing({ organisationId, registrationId })
      )

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      const { server } = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/download`
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when user is not a service maintainer', async () => {
      const { server } = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/download`,
        ...asServiceMaintainer({ scope: ['standardUser'] })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })
})

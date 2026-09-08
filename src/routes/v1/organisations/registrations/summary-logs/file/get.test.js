import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { createMockLogger } from '#test/mock-logger.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import './get.js'

const mockAuditSummaryLogDownload = vi.fn()

vi.mock('#root/auditing/summary-logs.js', () => ({
  auditSummaryLogDownload: (...args) => mockAuditSummaryLogDownload(...args)
}))

describe('GET /v1/organisations/{organisationId}/registrations/{registrationId}/summary-logs/{summaryLogId}/file', () => {
  setupAuthContext()

  const summaryLogId = new ObjectId().toString()
  const organisationId = new ObjectId().toString()
  const registrationId = new ObjectId().toString()

  const createServer = async (options = {}) => {
    const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    const summaryLogsRepository =
      summaryLogsRepositoryFactory(createMockLogger())

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
      url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${logId}/file`,
      ...asServiceMaintainer()
    })

  afterEach(() => {
    vi.clearAllMocks()
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

    it('records an audit log entry for the download', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await summaryLogsRepository.insert(
        summaryLogId,
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          file: { uri: 's3://re-ex-summary-logs/uploads/test-file.xlsx' }
        })
      )

      await makeRequest(server)

      expect(mockAuditSummaryLogDownload).toHaveBeenCalledWith(
        expect.anything(),
        {
          summaryLogId,
          organisationId,
          registrationId
        }
      )
    })

    it('logs the download with structured event data', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await summaryLogsRepository.insert(
        summaryLogId,
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          file: { uri: 's3://re-ex-summary-logs/uploads/test-file.xlsx' }
        })
      )

      await makeRequest(server)

      expect(server.loggerMocks.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: `Summary log file downloaded for summaryLogId: ${summaryLogId}, organisationId: ${organisationId}, registrationId: ${registrationId}`,
          event: {
            category: LOGGING_EVENT_CATEGORIES.SERVER,
            action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
            reference: summaryLogId
          }
        })
      )
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

  describe('naming the download', () => {
    const withRegistration = async () => {
      const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
      const summaryLogsRepository =
        summaryLogsRepositoryFactory(createMockLogger())
      const getDownloadUrl = vi.spyOn(summaryLogsRepository, 'getDownloadUrl')

      const server = await createTestServer({
        repositories: {
          summaryLogsRepository: () => summaryLogsRepository,
          organisationsRepository: createInMemoryOrganisationsRepository([
            partialMock(
              buildOrganisation({
                id: organisationId,
                registrations: [
                  buildRegistration({
                    id: registrationId,
                    registrationNumber: 'R26ER5000000002PA'
                  })
                ]
              })
            )
          ])
        }
      })

      await summaryLogsRepository.insert(
        summaryLogId,
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          file: { uri: 's3://re-ex-summary-logs/uploads/test-file.xlsx' }
        })
      )

      return { server, getDownloadUrl }
    }

    it('passes the registration number through to the store', async () => {
      const { server, getDownloadUrl } = await withRegistration()

      await makeRequest(server)

      expect(getDownloadUrl).toHaveBeenCalledWith(
        summaryLogId,
        'R26ER5000000002PA'
      )
    })
  })

  describe('addressed by file id', () => {
    const fileId = new ObjectId().toString()

    const withFile = async () => {
      const { server, summaryLogsRepository } = await createServer()
      await summaryLogsRepository.insert(
        summaryLogId,
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          file: {
            id: fileId,
            uri: 's3://re-ex-summary-logs/uploads/test-file.xlsx'
          }
        })
      )

      return server
    }

    const requestByFileId = (server, id = fileId) =>
      server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/files/${id}`,
        ...asServiceMaintainer()
      })

    it('redirects to the download URL', async () => {
      const response = await requestByFileId(await withFile())

      expect(response.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY)
      expect(response.headers.location).toContain('uploads/test-file.xlsx')
    })

    it('returns 404 when no summary log holds that file', async () => {
      const response = await requestByFileId(
        await withFile(),
        new ObjectId().toString()
      )

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('records an audit log entry for the download', async () => {
      await requestByFileId(await withFile())

      expect(mockAuditSummaryLogDownload).toHaveBeenCalledWith(
        expect.anything(),
        { summaryLogId: fileId, organisationId, registrationId }
      )
    })

    it('returns 401 when not authenticated', async () => {
      const server = await withFile()

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/files/${fileId}`
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when the caller holds neither scope', async () => {
      const server = await withFile()

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/files/${fileId}`,
        ...asServiceMaintainer({ scope: ['standardUser'] })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })

  describe('authentication', () => {
    it('returns 401 when not authenticated', async () => {
      const { server } = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/file`
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when the caller holds neither scope', async () => {
      const { server } = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/file`,
        ...asServiceMaintainer({ scope: ['standardUser'] })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it.each([
      ['summary-log.read alone', ['summary-log.read']],
      ['organisation.read alone', ['organisation.read']]
    ])('returns 403 for a caller holding %s', async (_, scope) => {
      const { server } = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/file`,
        ...asServiceMaintainer({ scope })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('serves the file to a caller holding both scopes and no admin scope', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await summaryLogsRepository.insert(
        summaryLogId,
        summaryLogFactory.submitted({
          organisationId,
          registrationId,
          file: { uri: 's3://re-ex-summary-logs/uploads/test-file.xlsx' }
        })
      )

      const response = await server.inject({
        method: 'GET',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/file`,
        ...asServiceMaintainer({
          scope: ['summary-log.read', 'organisation.read']
        })
      })

      expect(response.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY)
    })
  })
})

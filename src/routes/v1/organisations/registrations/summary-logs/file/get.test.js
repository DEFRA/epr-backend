import { StatusCodes } from 'http-status-codes'
import { ObjectId } from 'mongodb'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import {
  REPROCESSOR_NUMBER,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { createTestServer } from '#test/create-test-server.js'
import { createMockLogger } from '#test/mock-logger.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const { buildOrganisation } = createOrganisationBuilders()

const mockAuditSummaryLogDownload = vi.fn()

vi.mock('#root/auditing/summary-logs.js', () => ({
  auditSummaryLogDownload: (...args) => mockAuditSummaryLogDownload(...args)
}))

describe('GET /organisations/{organisationNumber}/registrations/{registrationNumber}/summary-logs/{summaryLogId}/file', () => {
  setupAuthContext()

  const registration = reprocessor()
  const organisation = buildOrganisation({ registrations: [registration] })
  const summaryLogId = new ObjectId().toString()
  const organisationId = organisation.id
  const registrationId = registration.id
  const summaryLogs = `/organisations/${organisation.orgId}/registrations/${REPROCESSOR_NUMBER}/summary-logs`

  const fileUrl = (logId = summaryLogId) => `${summaryLogs}/${logId}/file`

  const createServer = async () => {
    const summaryLogsRepository =
      createInMemorySummaryLogsRepository()(createMockLogger())

    const server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(organisation)
        ]),
        summaryLogsRepository: () => summaryLogsRepository
      }
    })

    return { server, summaryLogsRepository }
  }

  const insertSubmitted = (summaryLogsRepository) =>
    summaryLogsRepository.insert(
      summaryLogId,
      summaryLogFactory.submitted({
        organisationId,
        registrationId,
        file: { uri: 's3://re-ex-summary-logs/uploads/test-file.xlsx' }
      })
    )

  const makeRequest = (server, logId = summaryLogId) =>
    server.inject({
      method: 'GET',
      url: fileUrl(logId),
      ...asServiceMaintainer()
    })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('when summary log exists and is submitted', () => {
    it('redirects to the download URL', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await insertSubmitted(summaryLogsRepository)

      const response = await makeRequest(server)

      expect(response.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY)
      expect(response.headers.location).toContain('re-ex-summary-logs')
      expect(response.headers.location).toContain('uploads/test-file.xlsx')
    })

    it('records an audit log entry for the download', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await insertSubmitted(summaryLogsRepository)

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
      await insertSubmitted(summaryLogsRepository)

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

    it('names the download after the registration number', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await insertSubmitted(summaryLogsRepository)
      const getDownloadUrl = vi.spyOn(summaryLogsRepository, 'getDownloadUrl')

      await makeRequest(server)

      expect(getDownloadUrl).toHaveBeenCalledWith(
        summaryLogId,
        REPROCESSOR_NUMBER
      )
    })
  })

  describe('when summary log does not exist', () => {
    it('returns 404', async () => {
      const { server } = await createServer()

      const response = await makeRequest(server, new ObjectId().toString())

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

      const response = await server.inject({ method: 'GET', url: fileUrl() })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 when the caller holds neither scope', async () => {
      const { server } = await createServer()

      const response = await server.inject({
        method: 'GET',
        url: fileUrl(),
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
        url: fileUrl(),
        ...asServiceMaintainer({ scope })
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('serves the file to a caller holding both scopes and no admin scope', async () => {
      const { server, summaryLogsRepository } = await createServer()
      await insertSubmitted(summaryLogsRepository)

      const response = await server.inject({
        method: 'GET',
        url: fileUrl(),
        ...asServiceMaintainer({
          scope: ['summary-log.read', 'organisation.read']
        })
      })

      expect(response.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY)
    })
  })
})

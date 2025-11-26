import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'

import { summaryLogsSubmitPath } from './post.js'

const { validToken } = entraIdMockAuthTokens

const summaryLogId = 'summary-log-123'
const organisationId = 'org-123'
const registrationId = 'reg-456'

describe(`${summaryLogsSubmitPath} route`, () => {
  setupAuthContext()
  let server
  let summaryLogsRepository
  let summaryLogsWorker

  beforeAll(async () => {
    summaryLogsRepository = {
      findById: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined)
    }

    summaryLogsWorker = {
      submit: vi.fn().mockResolvedValue(undefined)
    }

    const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

    server = await createTestServer({
      repositories: {
        summaryLogsRepository: (logger) => summaryLogsRepository
      },
      workers: {
        summaryLogsWorker
      },
      featureFlags
    })

    await server.initialize()
  })

  beforeEach(() => {
    summaryLogsRepository.findById.mockResolvedValue({
      version: 1,
      summaryLog: {
        status: SUMMARY_LOG_STATUS.VALIDATED,
        organisationId,
        registrationId
      }
    })
  })

  afterEach(() => {
    server.loggerMocks.info.mockClear()
    server.loggerMocks.error.mockClear()
    server.loggerMocks.warn.mockClear()

    vi.resetAllMocks()
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('happy path', () => {
    it('returns OK when summary log is validated', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns submitting status in response body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      const body = JSON.parse(response.payload)
      expect(body).toEqual({ status: 'submitting' })
    })

    it('returns Location header pointing to GET endpoint', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.headers.location).toBe(
        `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`
      )
    })

    it('updates summary log status to SUBMITTING using optimistic concurrency', async () => {
      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(summaryLogsRepository.update).toHaveBeenCalledWith(
        summaryLogId,
        1, // version for optimistic concurrency
        expect.objectContaining({
          status: SUMMARY_LOG_STATUS.SUBMITTING
        })
      )
    })

    it('calls validator submit with summary log ID', async () => {
      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(summaryLogsWorker.submit).toHaveBeenCalledWith(summaryLogId)
    })

    it('logs submission initiation', async () => {
      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(server.loggerMocks.info).toHaveBeenCalledWith({
        message: `Summary log submission initiated: summaryLogId=${summaryLogId}, organisationId=${organisationId}, registrationId=${registrationId}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: summaryLogId
        }
      })
    })
  })

  describe('error cases', () => {
    it('returns 404 when summary log does not exist', async () => {
      summaryLogsRepository.findById.mockResolvedValue(null)

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe(`Summary log ${summaryLogId} not found`)
    })

    it('returns 409 when summary log status is not VALIDATED', async () => {
      summaryLogsRepository.findById.mockResolvedValue({
        version: 1,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.VALIDATING,
          organisationId,
          registrationId
        }
      })

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe(
        `Summary log must be validated before submission. Current status: ${SUMMARY_LOG_STATUS.VALIDATING}`
      )
    })

    it('returns 500 when validator submit throws non-Boom error', async () => {
      const testError = new Error('Unexpected error')
      summaryLogsWorker.submit.mockRejectedValue(testError)

      // Suppress Hapi debug output for this test
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      consoleErrorSpy.mockRestore()

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    })

    it('logs error when validator submit throws non-Boom error', async () => {
      const testError = new Error('Unexpected error')
      summaryLogsWorker.submit.mockRejectedValue(testError)

      // Suppress Hapi debug output for this test
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        headers: {
          Authorization: `Bearer ${validToken}`
        }
      })

      consoleErrorSpy.mockRestore()

      expect(server.loggerMocks.error).toHaveBeenCalledWith({
        error: testError,
        message: `Failure on ${summaryLogsSubmitPath}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
        },
        http: {
          response: {
            status_code: StatusCodes.INTERNAL_SERVER_ERROR
          }
        }
      })
    })
  })
})

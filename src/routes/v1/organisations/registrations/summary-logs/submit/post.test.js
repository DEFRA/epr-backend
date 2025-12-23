import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  SUMMARY_LOG_STATUS,
  NO_PRIOR_SUBMISSION
} from '#domain/summary-logs/status.js'
import {
  PROCESSING_TYPES,
  SUMMARY_LOG_META_FIELDS
} from '#domain/summary-logs/meta-fields.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { summaryLogsSubmitPath } from './post.js'

const mockAuditSummaryLogSubmit = vi.fn()
const mockRecordStatusTransition = vi.fn()

vi.mock('#root/auditing/summary-logs.js', () => ({
  auditSummaryLogSubmit: (...args) => mockAuditSummaryLogSubmit(...args)
}))

vi.mock('#common/helpers/metrics/summary-logs.js', () => ({
  summaryLogMetrics: {
    recordStatusTransition: (...args) => mockRecordStatusTransition(...args)
  }
}))

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
      update: vi.fn().mockResolvedValue(undefined),
      transitionToSubmittingExclusive: vi.fn(),
      findLatestSubmittedForOrgReg: vi.fn()
    }

    summaryLogsWorker = {
      submit: vi.fn().mockResolvedValue(undefined)
    }

    const featureFlags = createInMemoryFeatureFlags({ summaryLogs: true })

    server = await createTestServer({
      repositories: {
        summaryLogsRepository: (_logger) => summaryLogsRepository
      },
      workers: {
        summaryLogsWorker
      },
      featureFlags
    })

    await server.initialize()
  })

  beforeEach(() => {
    // Default happy path: transition succeeds
    summaryLogsRepository.transitionToSubmittingExclusive.mockResolvedValue({
      success: true,
      summaryLog: {
        status: SUMMARY_LOG_STATUS.SUBMITTING,
        organisationId,
        registrationId,
        validatedAgainstSummaryLogId: NO_PRIOR_SUBMISSION,
        meta: {
          [SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]:
            PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      },
      version: 2
    })
    summaryLogsRepository.findLatestSubmittedForOrgReg.mockResolvedValue(null)
  })

  afterEach(() => {
    server.loggerMocks.info.mockClear()
    server.loggerMocks.error.mockClear()
    server.loggerMocks.warn.mockClear()
    mockAuditSummaryLogSubmit.mockClear()
    mockRecordStatusTransition.mockClear()

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
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns submitting status in response body', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      const body = JSON.parse(response.payload)
      expect(body).toEqual({ status: 'submitting' })
    })

    it('returns Location header pointing to GET endpoint', async () => {
      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.headers.location).toBe(
        `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`
      )
    })

    it('calls transitionToSubmittingExclusive to atomically transition status', async () => {
      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(
        summaryLogsRepository.transitionToSubmittingExclusive
      ).toHaveBeenCalledWith(summaryLogId)
    })

    it('calls validator submit with summary log ID', async () => {
      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(summaryLogsWorker.submit).toHaveBeenCalledWith(summaryLogId)
    })

    it('logs submission initiation', async () => {
      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
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

    it('calls findLatestSubmittedForOrgReg with correct org/reg IDs', async () => {
      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(
        summaryLogsRepository.findLatestSubmittedForOrgReg
      ).toHaveBeenCalledWith(organisationId, registrationId)
    })

    it('succeeds when validatedAgainstSummaryLogId matches current latest submitted', async () => {
      const baselineId = 'matching-submission-id'

      summaryLogsRepository.transitionToSubmittingExclusive.mockResolvedValue({
        success: true,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.SUBMITTING,
          organisationId,
          registrationId,
          validatedAgainstSummaryLogId: baselineId
        },
        version: 2
      })

      summaryLogsRepository.findLatestSubmittedForOrgReg.mockResolvedValue({
        id: baselineId,
        version: 1,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.SUBMITTED,
          organisationId,
          registrationId
        }
      })

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('error cases', () => {
    it('returns 404 when summary log does not exist', async () => {
      summaryLogsRepository.transitionToSubmittingExclusive.mockRejectedValue(
        Boom.notFound(`Summary log ${summaryLogId} not found`)
      )

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe(`Summary log ${summaryLogId} not found`)
    })

    it('returns 409 when summary log status is not VALIDATED', async () => {
      summaryLogsRepository.transitionToSubmittingExclusive.mockRejectedValue(
        Boom.conflict(
          `Summary log must be validated before submission. Current status: ${SUMMARY_LOG_STATUS.VALIDATING}`
        )
      )

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe(
        `Summary log must be validated before submission. Current status: ${SUMMARY_LOG_STATUS.VALIDATING}`
      )
    })

    it('returns 409 when another submission is in progress', async () => {
      summaryLogsRepository.transitionToSubmittingExclusive.mockResolvedValue({
        success: false
      })

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe(
        'Another submission is in progress. Please try again.'
      )
    })

    it('returns 409 when preview is stale (another submission completed since preview)', async () => {
      // Preview was generated when 'old-submission-id' was the latest submitted log
      summaryLogsRepository.transitionToSubmittingExclusive.mockResolvedValue({
        success: true,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.SUBMITTING,
          organisationId,
          registrationId,
          validatedAgainstSummaryLogId: 'old-submission-id'
        },
        version: 2
      })

      // But now there's a newer submitted log
      summaryLogsRepository.findLatestSubmittedForOrgReg.mockResolvedValue({
        id: 'new-submission-id',
        version: 1,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.SUBMITTED,
          organisationId,
          registrationId
        }
      })

      const response = await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      const body = JSON.parse(response.payload)
      expect(body.message).toBe(
        'Waste records have changed since preview was generated. Please re-upload.'
      )
    })

    it('supersedes stale summary log when preview is stale', async () => {
      summaryLogsRepository.transitionToSubmittingExclusive.mockResolvedValue({
        success: true,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.SUBMITTING,
          organisationId,
          registrationId,
          validatedAgainstSummaryLogId: 'old-submission-id'
        },
        version: 2
      })

      summaryLogsRepository.findLatestSubmittedForOrgReg.mockResolvedValue({
        id: 'new-submission-id',
        version: 1,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.SUBMITTED,
          organisationId,
          registrationId
        }
      })

      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(summaryLogsRepository.update).toHaveBeenCalledWith(
        summaryLogId,
        2,
        { status: SUMMARY_LOG_STATUS.SUPERSEDED, expiresAt: expect.any(Date) }
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
        ...asStandardUser({ linkedOrgId: organisationId })
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
        ...asStandardUser({ linkedOrgId: organisationId })
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

  describe('auditing', () => {
    it('records audit event on successful submit', async () => {
      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(mockAuditSummaryLogSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          auth: expect.objectContaining({
            credentials: expect.objectContaining({
              linkedOrgId: organisationId
            })
          })
        }),
        {
          summaryLogId,
          organisationId,
          registrationId
        }
      )
    })

    it('does not record audit event when submission is in progress (409)', async () => {
      summaryLogsRepository.transitionToSubmittingExclusive.mockResolvedValue({
        success: false
      })

      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(mockAuditSummaryLogSubmit).not.toHaveBeenCalled()
    })

    it('does not record audit event when preview is stale', async () => {
      summaryLogsRepository.transitionToSubmittingExclusive.mockResolvedValue({
        success: true,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.SUBMITTING,
          organisationId,
          registrationId,
          validatedAgainstSummaryLogId: 'old-submission-id'
        },
        version: 2
      })

      summaryLogsRepository.findLatestSubmittedForOrgReg.mockResolvedValue({
        id: 'new-submission-id',
        version: 1,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.SUBMITTED,
          organisationId,
          registrationId
        }
      })

      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(mockAuditSummaryLogSubmit).not.toHaveBeenCalled()
    })
  })

  describe('metrics', () => {
    it('records status transition metric for submitting on successful submit', async () => {
      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(mockRecordStatusTransition).toHaveBeenCalledWith(
        SUMMARY_LOG_STATUS.SUBMITTING,
        PROCESSING_TYPES.REPROCESSOR_INPUT
      )
    })

    it('records status transition metric for superseded when preview is stale', async () => {
      summaryLogsRepository.transitionToSubmittingExclusive.mockResolvedValue({
        success: true,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.SUBMITTING,
          organisationId,
          registrationId,
          validatedAgainstSummaryLogId: 'old-submission-id',
          meta: {
            [SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]: PROCESSING_TYPES.EXPORTER
          }
        },
        version: 2
      })

      summaryLogsRepository.findLatestSubmittedForOrgReg.mockResolvedValue({
        id: 'new-submission-id',
        version: 1,
        summaryLog: {
          status: SUMMARY_LOG_STATUS.SUBMITTED,
          organisationId,
          registrationId
        }
      })

      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(mockRecordStatusTransition).toHaveBeenCalledWith(
        SUMMARY_LOG_STATUS.SUPERSEDED,
        PROCESSING_TYPES.EXPORTER
      )
    })

    it('does not record submitting metric when another submission is in progress', async () => {
      summaryLogsRepository.transitionToSubmittingExclusive.mockResolvedValue({
        success: false
      })

      await server.inject({
        method: 'POST',
        url: `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`,
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(mockRecordStatusTransition).not.toHaveBeenCalled()
    })
  })
})

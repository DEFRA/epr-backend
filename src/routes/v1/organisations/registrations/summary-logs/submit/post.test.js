import { randomUUID } from 'node:crypto'

import { StatusCodes } from 'http-status-codes'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import {
  NO_PRIOR_SUBMISSION,
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import {
  PROCESSING_TYPES,
  SUMMARY_LOG_META_FIELDS
} from '#domain/summary-logs/meta-fields.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createMockLogger } from '#test/mock-logger.js'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator } from '#test/inject-auth.js'
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

const seedValidatingSummaryLog = async (repository, id, overrides = {}) => {
  await repository.insert(id, summaryLogFactory.validating(overrides))
  return waitForVersion(repository, id, 1)
}

const seedValidatedSummaryLog = async (repository, id, overrides = {}) => {
  const inserted = await seedValidatingSummaryLog(repository, id, overrides)
  await repository.update(
    id,
    inserted.version,
    transitionStatus(inserted.summaryLog, SUMMARY_LOG_STATUS.VALIDATED)
  )
  return waitForVersion(repository, id, inserted.version + 1)
}

const seedSubmittedSummaryLog = async (repository, id, overrides = {}) => {
  await repository.insert(id, summaryLogFactory.submitted(overrides))
  return waitForVersion(repository, id, 1)
}

const submitUrl = (organisationId, registrationId, summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}/submit`

describe(`${summaryLogsSubmitPath} route`, () => {
  setupAuthContext()
  let server
  let summaryLogsRepository
  let summaryLogsWorker

  beforeAll(async () => {
    const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    summaryLogsRepository = summaryLogsRepositoryFactory(createMockLogger())

    summaryLogsWorker = {
      submit: vi.fn().mockResolvedValue(undefined)
    }

    const featureFlags = createInMemoryFeatureFlags()

    server = await createTestServer({
      repositories: {
        summaryLogsRepository: summaryLogsRepositoryFactory
      },
      workers: {
        summaryLogsWorker
      },
      featureFlags
    })
  })

  beforeEach(() => {
    summaryLogsWorker.submit.mockResolvedValue(undefined)
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

  it('transitions a validated summary log to submitting and records its side-effects', async () => {
    const organisationId = randomUUID()
    const registrationId = randomUUID()
    const summaryLogId = randomUUID()

    const validated = await seedValidatedSummaryLog(
      summaryLogsRepository,
      summaryLogId,
      {
        organisationId,
        registrationId,
        validatedAgainstSummaryLogId: NO_PRIOR_SUBMISSION,
        meta: {
          [SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]:
            PROCESSING_TYPES.REPROCESSOR_INPUT
        }
      }
    )

    const response = await server.inject({
      method: 'POST',
      url: submitUrl(organisationId, registrationId, summaryLogId),
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toEqual({ status: 'submitting' })
    expect(response.headers.location).toBe(
      `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${summaryLogId}`
    )

    const stored = await waitForVersion(
      summaryLogsRepository,
      summaryLogId,
      validated.version + 1
    )
    expect(stored.summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUBMITTING)
    expect(stored.summaryLog.submittedAt).toEqual(expect.any(String))

    expect(summaryLogsWorker.submit).toHaveBeenCalledWith(
      summaryLogId,
      expect.objectContaining({
        auth: expect.objectContaining({
          credentials: expect.objectContaining({
            id: 'test-user-id',
            email: 'test@example.com'
          })
        })
      })
    )
    expect(mockAuditSummaryLogSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: expect.objectContaining({
          credentials: expect.objectContaining({
            id: 'test-user-id',
            email: 'test@example.com'
          })
        })
      }),
      { summaryLogId, organisationId, registrationId }
    )
    expect(mockRecordStatusTransition).toHaveBeenCalledWith({
      status: SUMMARY_LOG_STATUS.SUBMITTING,
      processingType: PROCESSING_TYPES.REPROCESSOR_INPUT
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

  it('submits when the preview baseline still matches the latest submitted log', async () => {
    const organisationId = randomUUID()
    const registrationId = randomUUID()
    const baselineId = randomUUID()
    const summaryLogId = randomUUID()

    await seedSubmittedSummaryLog(summaryLogsRepository, baselineId, {
      organisationId,
      registrationId
    })
    const validated = await seedValidatedSummaryLog(
      summaryLogsRepository,
      summaryLogId,
      {
        organisationId,
        registrationId,
        validatedAgainstSummaryLogId: baselineId
      }
    )

    const response = await server.inject({
      method: 'POST',
      url: submitUrl(organisationId, registrationId, summaryLogId),
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)

    const stored = await waitForVersion(
      summaryLogsRepository,
      summaryLogId,
      validated.version + 1
    )
    expect(stored.summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUBMITTING)
  })

  it('returns 404 when the summary log does not exist', async () => {
    const organisationId = randomUUID()
    const registrationId = randomUUID()
    const summaryLogId = randomUUID()

    const response = await server.inject({
      method: 'POST',
      url: submitUrl(organisationId, registrationId, summaryLogId),
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    expect(JSON.parse(response.payload).message).toBe(
      `Summary log with id ${summaryLogId} not found`
    )
  })

  it('returns 409 and leaves the log untouched when it is not yet validated', async () => {
    const organisationId = randomUUID()
    const registrationId = randomUUID()
    const summaryLogId = randomUUID()

    await seedValidatingSummaryLog(summaryLogsRepository, summaryLogId, {
      organisationId,
      registrationId
    })

    const response = await server.inject({
      method: 'POST',
      url: submitUrl(organisationId, registrationId, summaryLogId),
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    expect(JSON.parse(response.payload).message).toBe(
      `Summary log must be validated before submission. Current status: ${SUMMARY_LOG_STATUS.VALIDATING}`
    )

    const stored = await summaryLogsRepository.findById(summaryLogId)
    expect(stored.summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATING)
  })

  it('returns 409 without auditing or recording a metric when another submission is in progress', async () => {
    const organisationId = randomUUID()
    const registrationId = randomUUID()
    const inProgressId = randomUUID()
    const summaryLogId = randomUUID()

    await seedValidatedSummaryLog(summaryLogsRepository, inProgressId, {
      organisationId,
      registrationId
    })
    await summaryLogsRepository.transitionToSubmittingExclusive(inProgressId)

    await seedValidatedSummaryLog(summaryLogsRepository, summaryLogId, {
      organisationId,
      registrationId
    })

    const response = await server.inject({
      method: 'POST',
      url: submitUrl(organisationId, registrationId, summaryLogId),
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    expect(JSON.parse(response.payload).message).toBe(
      'Another submission is in progress. Please try again.'
    )

    const stored = await summaryLogsRepository.findById(summaryLogId)
    expect(stored.summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)

    expect(mockAuditSummaryLogSubmit).not.toHaveBeenCalled()
    expect(mockRecordStatusTransition).not.toHaveBeenCalled()
  })

  it('supersedes the log and returns 409 when the preview is stale', async () => {
    const organisationId = randomUUID()
    const registrationId = randomUUID()
    const newerSubmittedId = randomUUID()
    const staleBaselineId = randomUUID()
    const summaryLogId = randomUUID()

    await seedSubmittedSummaryLog(summaryLogsRepository, newerSubmittedId, {
      organisationId,
      registrationId
    })
    const validated = await seedValidatedSummaryLog(
      summaryLogsRepository,
      summaryLogId,
      {
        organisationId,
        registrationId,
        validatedAgainstSummaryLogId: staleBaselineId,
        meta: {
          [SUMMARY_LOG_META_FIELDS.PROCESSING_TYPE]: PROCESSING_TYPES.EXPORTER
        }
      }
    )

    const response = await server.inject({
      method: 'POST',
      url: submitUrl(organisationId, registrationId, summaryLogId),
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    expect(JSON.parse(response.payload).message).toBe(
      'Waste records have changed since preview was generated. Please re-upload.'
    )

    const stored = await waitForVersion(
      summaryLogsRepository,
      summaryLogId,
      validated.version + 2
    )
    expect(stored.summaryLog.status).toBe(SUMMARY_LOG_STATUS.SUPERSEDED)
    expect(stored.summaryLog.expiresAt).toBeInstanceOf(Date)

    expect(mockRecordStatusTransition).toHaveBeenCalledWith({
      status: SUMMARY_LOG_STATUS.SUPERSEDED,
      processingType: PROCESSING_TYPES.EXPORTER
    })
    expect(mockAuditSummaryLogSubmit).not.toHaveBeenCalled()
  })

  it('returns 500 and logs the failure when the submission worker throws a non-Boom error', async () => {
    const organisationId = randomUUID()
    const registrationId = randomUUID()
    const summaryLogId = randomUUID()

    await seedValidatedSummaryLog(summaryLogsRepository, summaryLogId, {
      organisationId,
      registrationId
    })

    const testError = new Error('Unexpected error')
    summaryLogsWorker.submit.mockRejectedValue(testError)

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})

    const response = await server.inject({
      method: 'POST',
      url: submitUrl(organisationId, registrationId, summaryLogId),
      ...asOperator()
    })

    consoleErrorSpy.mockRestore()

    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
    expect(server.loggerMocks.error).toHaveBeenCalledWith({
      err: testError,
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

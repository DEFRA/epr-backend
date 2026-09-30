import { randomUUID } from 'node:crypto'

import { StatusCodes } from 'http-status-codes'

import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createMockLogger } from '#test/mock-logger.js'
import { createTestServer } from '#test/create-test-server.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import { summaryLogsUploadCompletedYearPath } from './year-post.js'

const mockRecordStatusTransition = vi.fn()

vi.mock('#application/summary-logs/metrics.js', () => ({
  summaryLogMetrics: {
    recordStatusTransition: (...args) => mockRecordStatusTransition(...args)
  }
}))

const organisationId = '507f1f77bcf86cd799439011'
const registrationId = '507f1f77bcf86cd799439012'

const createFileDetails = (overrides) => ({
  fileId: 'file-123',
  filename: 'test.xlsx',
  fileStatus: 'complete',
  s3Bucket: 'test-bucket',
  s3Key: 'test-key',
  ...overrides
})

const createCompletePayload = (fileId = 'file-complete-123') => ({
  uploadStatus: 'ready',
  metadata: { organisationId, registrationId },
  form: {
    summaryLogUpload: createFileDetails({ fileId })
  },
  numberOfRejectedFiles: 0
})

const uploadCompletedUrl = (year, summaryLogId) =>
  `/v1/organisations/${organisationId}/registrations/${registrationId}/summary-logs/${year}/${summaryLogId}/upload-completed`

const createTestOrganisationsRepository = () =>
  createInMemoryOrganisationsRepository([
    {
      ...buildOrganisation({
        id: organisationId,
        registrations: [
          buildRegistration({ id: registrationId, accreditationId: undefined })
        ]
      }),
      status: 'active'
    }
  ])()

describe(`${summaryLogsUploadCompletedYearPath} route`, () => {
  // Mock OIDC servers are needed for server startup (auth plugin fetches configs)
  // but the route itself is unauthenticated.
  setupAuthContext()

  let server
  let summaryLogsRepository
  let summaryLogsWorker

  beforeAll(async () => {
    const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    summaryLogsRepository = summaryLogsRepositoryFactory(createMockLogger())

    const organisationsRepository = createTestOrganisationsRepository()

    summaryLogsWorker = {
      validate: vi.fn()
    }

    server = await createTestServer({
      repositories: {
        summaryLogsRepository: summaryLogsRepositoryFactory,
        organisationsRepository: () => organisationsRepository
      },
      workers: {
        summaryLogsWorker
      }
    })
  })

  afterEach(() => {
    server.loggerMocks.info.mockClear()
    mockRecordStatusTransition.mockClear()
    vi.resetAllMocks()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('stores the year from the path and the accreditation from the registration', async () => {
    const summaryLogId = randomUUID()

    const response = await server.inject({
      method: 'POST',
      url: uploadCompletedUrl(2026, summaryLogId),
      payload: createCompletePayload('file-with-year')
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
    const stored = await waitForVersion(summaryLogsRepository, summaryLogId, 1)
    expect(stored.summaryLog).toMatchObject({
      status: SUMMARY_LOG_STATUS.VALIDATING,
      organisationId,
      registrationId,
      year: 2026,
      accreditationId: null
    })
    expect(stored.summaryLog.validatedAgainstSummaryLogId).toBeDefined()

    expect(summaryLogsWorker.validate).toHaveBeenCalledWith(summaryLogId)
    expect(mockRecordStatusTransition).toHaveBeenCalledWith({
      status: SUMMARY_LOG_STATUS.VALIDATING
    })
  })

  describe('when the registration has an active accreditation', () => {
    const accreditedOrganisationId = '507f1f77bcf86cd799439013'
    const accreditedRegistrationId = '507f1f77bcf86cd799439014'
    const accreditationId = '507f1f77bcf86cd799439015'

    let accreditedServer
    let accreditedSummaryLogsRepository

    beforeAll(async () => {
      const accreditedSummaryLogsRepositoryFactory =
        createInMemorySummaryLogsRepository()
      accreditedSummaryLogsRepository = accreditedSummaryLogsRepositoryFactory(
        createMockLogger()
      )

      const accreditedOrganisationsRepository =
        createInMemoryOrganisationsRepository([
          {
            ...buildOrganisation({
              id: accreditedOrganisationId,
              registrations: [
                buildRegistration({
                  id: accreditedRegistrationId,
                  accreditationId,
                  statusHistory: [{ status: 'approved', updatedAt: new Date() }]
                })
              ],
              accreditations: [
                buildAccreditation({
                  id: accreditationId,
                  statusHistory: [{ status: 'approved', updatedAt: new Date() }]
                })
              ]
            }),
            status: 'active'
          }
        ])()

      accreditedServer = await createTestServer({
        repositories: {
          summaryLogsRepository: accreditedSummaryLogsRepositoryFactory,
          organisationsRepository: () => accreditedOrganisationsRepository
        },
        workers: {
          summaryLogsWorker: { validate: vi.fn() }
        }
      })
    })

    afterAll(async () => {
      await accreditedServer.stop()
    })

    it('stores the accreditation from the registration', async () => {
      const summaryLogId = randomUUID()

      const response = await accreditedServer.inject({
        method: 'POST',
        url: `/v1/organisations/${accreditedOrganisationId}/registrations/${accreditedRegistrationId}/summary-logs/2026/${summaryLogId}/upload-completed`,
        payload: {
          uploadStatus: 'ready',
          metadata: {
            organisationId: accreditedOrganisationId,
            registrationId: accreditedRegistrationId
          },
          form: {
            summaryLogUpload: createFileDetails({ fileId: 'file-accredited' })
          },
          numberOfRejectedFiles: 0
        }
      })

      expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
      const stored = await waitForVersion(
        accreditedSummaryLogsRepository,
        summaryLogId,
        1
      )
      expect(stored.summaryLog).toMatchObject({
        year: 2026,
        accreditationId
      })
    })
  })

  it('stores a preprocessing summary log without validating when the file is still pending', async () => {
    const summaryLogId = randomUUID()

    const response = await server.inject({
      method: 'POST',
      url: uploadCompletedUrl(2026, summaryLogId),
      payload: {
        uploadStatus: 'ready',
        metadata: { organisationId, registrationId },
        form: {
          summaryLogUpload: createFileDetails({
            fileId: 'file-pending-scan',
            fileStatus: 'pending',
            s3Bucket: undefined,
            s3Key: undefined
          })
        },
        numberOfRejectedFiles: 0
      }
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
    const stored = await waitForVersion(summaryLogsRepository, summaryLogId, 1)
    expect(stored.summaryLog.status).toBe(SUMMARY_LOG_STATUS.PREPROCESSING)
    expect(summaryLogsWorker.validate).not.toHaveBeenCalled()
  })

  it('returns 422 for an invalid year', async () => {
    const response = await server.inject({
      method: 'POST',
      url: uploadCompletedUrl('not-a-year', randomUUID()),
      payload: createCompletePayload('file-bad-year')
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('rejects a second submitting transition with a conflict, sharing the state machine with the legacy callback', async () => {
    const summaryLogId = randomUUID()

    await server.inject({
      method: 'POST',
      url: uploadCompletedUrl(2026, summaryLogId),
      payload: createCompletePayload('file-complete-1')
    })

    const response = await server.inject({
      method: 'POST',
      url: uploadCompletedUrl(2026, summaryLogId),
      payload: {
        uploadStatus: 'ready',
        metadata: { organisationId, registrationId },
        form: {
          summaryLogUpload: createFileDetails({
            fileId: 'file-pending-1',
            fileStatus: 'pending',
            s3Bucket: undefined,
            s3Key: undefined
          })
        },
        numberOfRejectedFiles: 0
      }
    })

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
  })

  describe('when the repository fails unexpectedly', () => {
    let failingServer
    const insertError = new Error('Database connection failed')

    beforeAll(async () => {
      const organisationsRepository = createTestOrganisationsRepository()

      failingServer = await createTestServer({
        repositories: {
          summaryLogsRepository: () => ({
            findById: async () => null,
            findLatestSubmittedForOrgReg: async () => null,
            insert: async () => {
              throw insertError
            }
          }),
          organisationsRepository: () => organisationsRepository
        },
        workers: {
          summaryLogsWorker: { validate: vi.fn() }
        }
      })
    })

    afterEach(() => {
      failingServer.loggerMocks.error.mockClear()
    })

    afterAll(async () => {
      await failingServer.stop()
    })

    it('returns 500 and logs the failure', async () => {
      const summaryLogId = randomUUID()

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})

      const response = await failingServer.inject({
        method: 'POST',
        url: uploadCompletedUrl(2026, summaryLogId),
        payload: createCompletePayload('file-1')
      })

      consoleErrorSpy.mockRestore()

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      expect(failingServer.loggerMocks.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: insertError,
          message: `Failure on ${summaryLogsUploadCompletedYearPath}`,
          event: {
            category: 'server',
            action: 'response_failure'
          },
          http: {
            response: {
              status_code: StatusCodes.INTERNAL_SERVER_ERROR
            }
          }
        })
      )
    })
  })
})

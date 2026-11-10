import { randomUUID } from 'node:crypto'
import { organisationReadRepositoryFrom } from '#vite/helpers/organisation-read-model.js'

import { StatusCodes } from 'http-status-codes'

import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import {
  ACCREDITATION_NUMBER,
  REPROCESSOR_NUMBER,
  accreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createMockLogger } from '#test/mock-logger.js'
import { createTestServer } from '#test/create-test-server.js'
import { partialMock } from '#test/type-helpers.js'
import { signedCallback } from '#test/upload-callback.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const { buildOrganisation } = createOrganisationBuilders()

const mockRecordStatusTransition = vi.fn()

vi.mock('#application/summary-logs/metrics.js', () => ({
  summaryLogMetrics: {
    recordStatusTransition: (...args) => mockRecordStatusTransition(...args)
  }
}))

const organisationId = '507f1f77bcf86cd799439011'
const registrationId = '507f1f77bcf86cd799439012'
const orgId = 500123
const registrationNumber = REPROCESSOR_NUMBER

const uploadedKeyFor = (uploadOrganisationId, uploadRegistrationId) =>
  `/organisations/${uploadOrganisationId}/registrations/${uploadRegistrationId}/upload-1/file-1`

const createFileDetails = (overrides) => ({
  fileId: 'file-123',
  filename: 'test.xlsx',
  fileStatus: 'complete',
  s3Bucket: 're-ex-summary-logs',
  s3Key: uploadedKeyFor(organisationId, registrationId),
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

const uploadCompletedPath = (year, summaryLogId) =>
  `/organisations/${orgId}/registrations/${registrationNumber}/summary-logs/${year}/${summaryLogId}/upload-completed`

const uploadCompletedUrl = (year, summaryLogId) =>
  signedCallback(uploadCompletedPath(year, summaryLogId))

const createTestOrganisationsRepository = () =>
  createInMemoryOrganisationsRepository([
    partialMock(
      buildOrganisation({
        id: organisationId,
        orgId,
        registrations: [reprocessor({ id: registrationId })]
      })
    )
  ])()

describe('POST /organisations/{organisationNumber}/registrations/{registrationNumber}/summary-logs/{year}/{summaryLogId}/upload-completed', () => {
  // Mock OIDC servers are needed for server startup (auth plugin fetches configs)
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
        organisationsRepository: () => organisationsRepository,
        organisationReadRepository: await organisationReadRepositoryFrom(
          organisationsRepository
        )
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

  it('stores the year from the path, no accreditation, and the numbers', async () => {
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
      accreditationId: null,
      organisationNumber: String(orgId),
      registrationNumber,
      accreditationNumber: null
    })
    expect(stored.summaryLog.validatedAgainstSummaryLogId).toBeDefined()

    expect(summaryLogsWorker.validate).toHaveBeenCalledWith(summaryLogId)
    expect(mockRecordStatusTransition).toHaveBeenCalledWith({
      status: SUMMARY_LOG_STATUS.VALIDATING
    })
  })

  describe('when the path names an accreditation', () => {
    const accreditedOrganisationId = '507f1f77bcf86cd799439013'
    const accreditedRegistrationId = '507f1f77bcf86cd799439014'
    const accredited = accreditation()
    const accreditedOrganisation = buildOrganisation({
      id: accreditedOrganisationId,
      registrations: [
        reprocessor({
          id: accreditedRegistrationId,
          accreditationId: accredited.id
        })
      ],
      accreditations: [accredited]
    })
    const unnumbered = accreditation({ accreditationNumber: undefined })
    const unnumberedOrganisation = buildOrganisation({
      registrations: [reprocessor({ accreditationId: unnumbered.id })],
      accreditations: [unnumbered]
    })

    let accreditedServer
    let accreditedSummaryLogsRepository

    beforeAll(async () => {
      const accreditedSummaryLogsRepositoryFactory =
        createInMemorySummaryLogsRepository()
      accreditedSummaryLogsRepository =
        accreditedSummaryLogsRepositoryFactory(createMockLogger())

      const accreditedOrganisationsRepository =
        createInMemoryOrganisationsRepository([
          partialMock(accreditedOrganisation),
          partialMock(unnumberedOrganisation)
        ])()

      accreditedServer = await createTestServer({
        repositories: {
          summaryLogsRepository: accreditedSummaryLogsRepositoryFactory,
          organisationsRepository: () => accreditedOrganisationsRepository,
          organisationReadRepository: await organisationReadRepositoryFrom(
            accreditedOrganisationsRepository
          )
        },
        workers: {
          summaryLogsWorker: { validate: vi.fn() }
        }
      })
    })

    afterAll(async () => {
      await accreditedServer.stop()
    })

    it('stores the accreditation the path names, and its number', async () => {
      const summaryLogId = randomUUID()

      const response = await accreditedServer.inject({
        method: 'POST',
        url: signedCallback(
          `/organisations/${accreditedOrganisation.orgId}/registrations/${REPROCESSOR_NUMBER}/accreditations/2026/summary-log/${summaryLogId}/upload-completed`
        ),
        payload: {
          uploadStatus: 'ready',
          metadata: {
            organisationId: accreditedOrganisationId,
            registrationId: accreditedRegistrationId
          },
          form: {
            summaryLogUpload: createFileDetails({
              fileId: 'file-accredited',
              s3Key: uploadedKeyFor(
                accreditedOrganisationId,
                accreditedRegistrationId
              )
            })
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
        accreditationId: accredited.id,
        accreditationNumber: ACCREDITATION_NUMBER
      })
    })

    it('finds no accreditation without a number, and stores nothing', async () => {
      const summaryLogId = randomUUID()

      const response = await accreditedServer.inject({
        method: 'POST',
        url: signedCallback(
          `/organisations/${unnumberedOrganisation.orgId}/registrations/${REPROCESSOR_NUMBER}/accreditations/2026/summary-log/${summaryLogId}/upload-completed`
        ),
        payload: createCompletePayload('file-unnumbered')
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      expect(
        await accreditedSummaryLogsRepository.findById(summaryLogId)
      ).toBeNull()
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

  it('updates a preprocessing summary log in place when its upload completes', async () => {
    const summaryLogId = randomUUID()

    await server.inject({
      method: 'POST',
      url: uploadCompletedUrl(2026, summaryLogId),
      payload: {
        uploadStatus: 'ready',
        metadata: { organisationId, registrationId },
        form: {
          summaryLogUpload: createFileDetails({
            fileId: 'file-pending-then-complete',
            fileStatus: 'pending',
            s3Bucket: undefined,
            s3Key: undefined
          })
        },
        numberOfRejectedFiles: 0
      }
    })
    await waitForVersion(summaryLogsRepository, summaryLogId, 1)

    const response = await server.inject({
      method: 'POST',
      url: uploadCompletedUrl(2026, summaryLogId),
      payload: createCompletePayload('file-pending-then-complete')
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
    const updated = await waitForVersion(summaryLogsRepository, summaryLogId, 2)
    expect(updated.summaryLog.status).toBe(SUMMARY_LOG_STATUS.VALIDATING)
    expect(updated.summaryLog.year).toBe(2026)
  })

  it('returns 422 for an invalid year', async () => {
    const response = await server.inject({
      method: 'POST',
      url: uploadCompletedUrl('not-a-year', randomUUID()),
      payload: createCompletePayload('file-bad-year')
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  describe('when the upload is not where this registration sends its uploads', () => {
    it.for([
      {
        description: 'another bucket',
        s3Bucket: 'some-other-bucket',
        s3Key: uploadedKeyFor(organisationId, registrationId)
      },
      {
        description: 'another organisation',
        s3Bucket: 're-ex-summary-logs',
        s3Key: uploadedKeyFor('507f1f77bcf86cd799439099', registrationId)
      },
      {
        description: 'another registration',
        s3Bucket: 're-ex-summary-logs',
        s3Key: uploadedKeyFor(organisationId, '507f1f77bcf86cd799439099')
      }
    ])(
      'refuses $description, and stores nothing',
      async ({ s3Bucket, s3Key }) => {
        const summaryLogId = randomUUID()

        const response = await server.inject({
          method: 'POST',
          url: uploadCompletedUrl(2026, summaryLogId),
          payload: {
            ...createCompletePayload(),
            form: {
              summaryLogUpload: createFileDetails({ s3Bucket, s3Key })
            }
          }
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
        expect(await summaryLogsRepository.findById(summaryLogId)).toBeNull()
        expect(summaryLogsWorker.validate).not.toHaveBeenCalled()
      }
    )
  })

  it('refuses an unsigned callback, and stores nothing', async () => {
    const summaryLogId = randomUUID()

    const response = await server.inject({
      method: 'POST',
      url: uploadCompletedPath(2026, summaryLogId),
      payload: createCompletePayload()
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    expect(await summaryLogsRepository.findById(summaryLogId)).toBeNull()
    expect(summaryLogsWorker.validate).not.toHaveBeenCalled()
  })

  it.each([
    ['complete', 'rejected', 'validating', 'rejected'],
    ['complete', 'pending', 'validating', 'preprocessing'],
    ['rejected', 'complete', 'rejected', 'validating'],
    ['rejected', 'pending', 'rejected', 'preprocessing'],
    ['rejected', 'rejected', 'rejected', 'rejected'],
    ['complete', 'complete', 'validating', 'validating']
  ])(
    'refuses a %s callback followed by a %s callback, naming the move from %s to %s',
    async (firstFileStatus, secondFileStatus, fromStatus, toStatus) => {
      const summaryLogId = randomUUID()
      const withoutS3Location = { s3Bucket: undefined, s3Key: undefined }
      /** @type {Record<string, object>} */
      const callbackByFileStatus = {
        complete: createCompletePayload('file-complete'),
        pending: {
          ...createCompletePayload(),
          form: {
            summaryLogUpload: createFileDetails({
              fileId: 'file-pending',
              fileStatus: 'pending',
              ...withoutS3Location
            })
          }
        },
        rejected: {
          ...createCompletePayload(),
          form: {
            summaryLogUpload: createFileDetails({
              fileId: 'file-rejected',
              fileStatus: 'rejected',
              ...withoutS3Location,
              hasError: true,
              errorMessage: 'The selected file contains a virus'
            })
          },
          numberOfRejectedFiles: 1
        }
      }

      const first = await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(2026, summaryLogId),
        payload: callbackByFileStatus[firstFileStatus]
      })
      const second = await server.inject({
        method: 'POST',
        url: uploadCompletedUrl(2026, summaryLogId),
        payload: callbackByFileStatus[secondFileStatus]
      })

      expect(first.statusCode).toBe(StatusCodes.ACCEPTED)
      expect(second.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(second.payload).message).toBe(
        `Cannot transition summary log from ${fromStatus} to ${toStatus}`
      )
    }
  )

  describe('when the repository fails unexpectedly', () => {
    let failingServer
    const insertError = new Error('Database connection failed')

    beforeAll(async () => {
      const organisationsRepository = createTestOrganisationsRepository()

      failingServer = await createTestServer({
        repositories: {
          summaryLogsRepository: () => ({
            findById: async () => null,
            findLatestSubmitted: async () => null,
            insert: async () => {
              throw insertError
            }
          }),
          organisationsRepository: () => organisationsRepository,
          organisationReadRepository: await organisationReadRepositoryFrom(
            organisationsRepository
          )
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
          message: 'Failure completing summary log upload',
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

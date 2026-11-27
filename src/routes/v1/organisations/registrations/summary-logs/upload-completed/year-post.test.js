import {
  toAccreditationNumber,
  toOrganisationNumber
} from '#domain/organisations/numbers.js'
import { randomUUID } from 'node:crypto'
import {
  createInMemoryOrganisationReadRepository,
  accreditationsByYear,
  buildReadAccreditation,
  buildReadOrganisation,
  buildReadReprocessorRegistration,
  ACCREDITATION_NUMBER,
  REPROCESSOR_NUMBER
} from '#organisation-read-model/test-support.js'
import { toYear } from '#common/helpers/dates/year.js'

import { StatusCodes } from 'http-status-codes'

import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { createMockLogger } from '#test/mock-logger.js'
import { createTestServer } from '#test/create-test-server.js'
import { signedCallback } from '#test/upload-callback.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

const mockRecordStatusTransition = vi.fn()

vi.mock('#application/summary-logs/metrics.js', () => ({
  summaryLogMetrics: {
    recordStatusTransition: (...args) => mockRecordStatusTransition(...args)
  }
}))

const organisationId = '507f1f77bcf86cd799439011'
const registrationId = '507f1f77bcf86cd799439012'
const organisationNumber = toOrganisationNumber('500123')
const registrationNumber = REPROCESSOR_NUMBER

const uploadedKeyFor = (uploadOrganisation, uploadRegistration) =>
  `/organisations/${uploadOrganisation}/registrations/${uploadRegistration}/upload-1/file-1`

const createFileDetails = (overrides) => ({
  fileId: 'file-123',
  filename: 'test.xlsx',
  fileStatus: 'complete',
  s3Bucket: 're-ex-summary-logs',
  s3Key: uploadedKeyFor(organisationNumber, registrationNumber),
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
  `/organisations/${organisationNumber}/registrations/${registrationNumber}/summary-logs/${year}/${summaryLogId}/upload-completed`

const uploadCompletedUrl = (year, summaryLogId) =>
  signedCallback(uploadCompletedPath(year, summaryLogId))

/** Held by the read model alone: no legacy organisations are stored. */
const testReadOrganisationRepository = () =>
  createInMemoryOrganisationReadRepository([
    buildReadOrganisation({
      organisationNumber,
      registrations: {
        [registrationNumber]: buildReadReprocessorRegistration()
      }
    })
  ])

describe('POST /organisations/{organisationNumber}/registrations/{registrationNumber}/summary-logs/{year}/{summaryLogId}/upload-completed', () => {
  // Mock OIDC servers are needed for server startup (auth plugin fetches configs)
  setupAuthContext()

  let server
  let summaryLogsRepository
  let summaryLogsWorker

  beforeAll(async () => {
    const summaryLogsRepositoryFactory = createInMemorySummaryLogsRepository()
    summaryLogsRepository = summaryLogsRepositoryFactory(createMockLogger())

    summaryLogsWorker = {
      validate: vi.fn()
    }

    server = await createTestServer({
      repositories: {
        summaryLogsRepository: summaryLogsRepositoryFactory,
        organisationReadRepository: testReadOrganisationRepository()
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

  it('stores the year from the path, no accreditation, and the numbers, without database ids', async () => {
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
      year: 2026,
      organisationNumber,
      registrationNumber,
      accreditationNumber: null
    })
    expect(stored.summaryLog).not.toHaveProperty('organisationId')
    expect(stored.summaryLog).not.toHaveProperty('registrationId')
    expect(stored.summaryLog.validatedAgainstSummaryLogId).toBeDefined()

    expect(summaryLogsWorker.validate).toHaveBeenCalledWith(summaryLogId)
    expect(mockRecordStatusTransition).toHaveBeenCalledWith({
      status: SUMMARY_LOG_STATUS.VALIDATING
    })
  })

  describe('when the path names an accreditation', () => {
    // 2027 is held outside this service; the read model serves it alike.
    const EXTERNAL_ACCREDITATION_NUMBER =
      toAccreditationNumber('A27ER5001180041PL')
    const accreditedOrganisationNumber = toOrganisationNumber('500124')

    let accreditedServer
    let accreditedSummaryLogsRepository

    beforeAll(async () => {
      const accreditedSummaryLogsRepositoryFactory =
        createInMemorySummaryLogsRepository()
      accreditedSummaryLogsRepository =
        accreditedSummaryLogsRepositoryFactory(createMockLogger())

      accreditedServer = await createTestServer({
        repositories: {
          summaryLogsRepository: accreditedSummaryLogsRepositoryFactory,
          organisationReadRepository: createInMemoryOrganisationReadRepository([
            buildReadOrganisation({
              organisationNumber: accreditedOrganisationNumber,
              registrations: {
                [REPROCESSOR_NUMBER]: buildReadReprocessorRegistration({
                  accreditations: accreditationsByYear(
                    buildReadAccreditation({
                      accreditationNumber: ACCREDITATION_NUMBER
                    }),
                    buildReadAccreditation({
                      year: toYear(2027),
                      accreditationNumber: EXTERNAL_ACCREDITATION_NUMBER
                    })
                  )
                })
              }
            })
          ])
        },
        workers: {
          summaryLogsWorker: { validate: vi.fn() }
        }
      })
    })

    afterAll(async () => {
      await accreditedServer.stop()
    })

    /**
     * @param {number} year
     * @param {string} summaryLogId
     */
    const completeAccreditedUpload = (year, summaryLogId) =>
      accreditedServer.inject({
        method: 'POST',
        url: signedCallback(
          `/organisations/${accreditedOrganisationNumber}/registrations/${REPROCESSOR_NUMBER}/accreditations/${year}/summary-log/${summaryLogId}/upload-completed`
        ),
        payload: {
          uploadStatus: 'ready',
          form: {
            summaryLogUpload: createFileDetails({
              fileId: `file-accredited-${summaryLogId}`,
              s3Key: uploadedKeyFor(
                accreditedOrganisationNumber,
                REPROCESSOR_NUMBER
              )
            })
          },
          numberOfRejectedFiles: 0
        }
      })

    it.each([
      [2026, ACCREDITATION_NUMBER],
      [2027, EXTERNAL_ACCREDITATION_NUMBER]
    ])(
      'stores the %i accreditation the read model holds, by its number',
      async (year, accreditationNumber) => {
        const summaryLogId = randomUUID()

        const response = await completeAccreditedUpload(year, summaryLogId)

        expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
        const stored = await waitForVersion(
          accreditedSummaryLogsRepository,
          summaryLogId,
          1
        )
        expect(stored.summaryLog).toMatchObject({ year, accreditationNumber })
      }
    )

    it('returns 404 for a year the read model holds no accreditation for, and stores nothing', async () => {
      const summaryLogId = randomUUID()

      const response = await completeAccreditedUpload(2028, summaryLogId)

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      expect(
        await accreditedSummaryLogsRepository.findById(summaryLogId)
      ).toBeNull()
    })
  })

  it.each([
    ['an organisation', '500999', registrationNumber],
    ['a registration', organisationNumber, 'R26ER5001189999PL']
  ])(
    'returns 404 for %s the read model does not hold, and stores nothing',
    async (_, pathOrganisation, pathRegistration) => {
      const summaryLogId = randomUUID()

      const response = await server.inject({
        method: 'POST',
        url: signedCallback(
          `/organisations/${pathOrganisation}/registrations/${pathRegistration}/summary-logs/2026/${summaryLogId}/upload-completed`
        ),
        payload: createCompletePayload('file-unknown-registration')
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      expect(await summaryLogsRepository.findById(summaryLogId)).toBeNull()
    }
  )

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
        s3Key: uploadedKeyFor(organisationNumber, registrationNumber)
      },
      {
        description: 'another organisation',
        s3Bucket: 're-ex-summary-logs',
        s3Key: uploadedKeyFor('500999', registrationNumber)
      },
      {
        description: 'another registration',
        s3Bucket: 're-ex-summary-logs',
        s3Key: uploadedKeyFor(organisationNumber, 'R26ER5001189999PL')
      },
      {
        description: 'the registration ids uploads were placed under before',
        s3Bucket: 're-ex-summary-logs',
        s3Key: uploadedKeyFor(organisationId, registrationId)
      }
    ])(
      'refuses $description, rejects the summary log without the file, and logs an error',
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
        const { summaryLog } = await waitForVersion(
          summaryLogsRepository,
          summaryLogId,
          1
        )
        expect(summaryLog).toStrictEqual(
          expect.objectContaining({
            status: 'rejected',
            file: {
              id: 'file-123',
              name: 'test.xlsx',
              status: 'rejected'
            },
            validation: { failures: [{ kind: 'file', code: 'FILE_REJECTED' }] }
          })
        )
        expect(summaryLogsWorker.validate).not.toHaveBeenCalled()
        expect(server.loggerMocks.error).toHaveBeenCalledWith(
          expect.objectContaining({
            message: `Upload is not in the upload location for this registration: summaryLogId=${summaryLogId}, s3Bucket=${s3Bucket}, s3Key=${s3Key}`,
            event: expect.objectContaining({ reference: summaryLogId })
          })
        )
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
      failingServer = await createTestServer({
        repositories: {
          summaryLogsRepository: () => ({
            findById: async () => null,
            findLatestSubmitted: async () => null,
            insert: async () => {
              throw insertError
            }
          }),
          organisationReadRepository: testReadOrganisationRepository()
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

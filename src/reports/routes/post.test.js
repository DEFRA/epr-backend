import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { config } from '#root/config.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { buildAwaitingAcceptancePrn } from '#packaging-recycling-notes/repository/contract/test-data.js'
import {
  buildOrganisation,
  buildOrganisationWithRegistration,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { reportsPostPath } from './post.js'
import * as reportAudit from '#reports/application/audit.js'

vi.mock('#reports/application/audit.js', () => ({
  auditReportCreate: vi.fn().mockResolvedValue(undefined),
  auditReportDelete: vi.fn().mockResolvedValue(undefined)
}))

describe(`POST ${reportsPostPath}`, () => {
  setupAuthContext()

  const makeUrl = (orgId, regId, year, cadence, period, submissionNumber) =>
    `/v1/organisations/${orgId}/registrations/${regId}/reports/${year}/${cadence}/${period}/submissions/${submissionNumber}`

  const createServer = async (registrationOverrides = {}) => {
    const registration = buildRegistration(registrationOverrides)
    const org = buildOrganisation({ registrations: [registration] })

    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository()
    const organisationsRepository = organisationsRepositoryFactory()
    await organisationsRepository.insert(org)

    const wasteRecordsRepositoryFactory = createInMemoryWasteRecordsRepository([
      {
        id: new ObjectId().toString(),
        organisationId: org.id,
        registrationId: registration.id,
        type: 'received',
        data: {},
        versions: [
          {
            createdAt: '2024-01-15T00:00:00.000Z',
            summaryLog: { id: 'sl-1' }
          }
        ]
      }
    ])
    const reportsRepositoryFactory = createInMemoryReportsRepository()

    const server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        wasteRecordsRepository: wasteRecordsRepositoryFactory,
        reportsRepository: reportsRepositoryFactory
      },
      featureFlags: createInMemoryFeatureFlags()
    })

    return {
      server,
      organisationId: org.id,
      registrationId: registration.id,
      reportsRepositoryFactory
    }
  }

  const makeRequest = (
    server,
    orgId,
    regId,
    year = 2025,
    cadence = 'quarterly',
    period = 1,
    submissionNumber = 1
  ) =>
    server.inject({
      method: 'POST',
      url: makeUrl(orgId, regId, year, cadence, period, submissionNumber),
      ...asOperator()
    })

  it('returns 201 with created report including data sections', async () => {
    const { server, organisationId, registrationId } = await createServer({
      wasteProcessingType: 'reprocessor',
      accreditationId: undefined
    })

    const response = await makeRequest(server, organisationId, registrationId)

    expect(response.statusCode).toBe(StatusCodes.CREATED)
    const payload = JSON.parse(response.payload)
    expect(payload.id).toBeDefined()
    expect(payload.status.currentStatus).toBe('in_progress')
    expect(payload.status.history).toStrictEqual([
      expect.objectContaining({
        status: 'in_progress',
        at: expect.any(String)
      })
    ])
    expect(payload.material).toBe('glass_re_melt')
    expect(payload.wasteProcessingType).toBe('reprocessor')
    expect(payload.details.material).toBe('glass')
    expect(payload.details.site).toBeDefined()
    expect(payload.recyclingActivity).toStrictEqual({
      suppliers: [],
      totalTonnageReceived: 0,
      tonnageRecycled: null,
      tonnageNotRecycled: null
    })
    expect(payload.wasteSent).toStrictEqual({
      tonnageSentToReprocessor: 0,
      tonnageSentToExporter: 0,
      tonnageSentToAnotherSite: 0,
      finalDestinations: []
    })
    expect(payload.exportActivity).toBeUndefined()
  })

  it('returns 409 with structured existingReport when a report for the same period already exists', async () => {
    const { server, organisationId, registrationId } = await createServer({
      wasteProcessingType: 'reprocessor',
      accreditationId: undefined
    })

    const first = await makeRequest(server, organisationId, registrationId)
    const firstPayload = JSON.parse(first.payload)
    const response = await makeRequest(server, organisationId, registrationId)

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    expect(JSON.parse(response.payload)).toEqual({
      statusCode: StatusCodes.CONFLICT,
      error: 'Conflict',
      message: 'Report already exists for quarterly period 1 of 2025',
      existingReport: {
        id: firstPayload.id,
        cadence: 'quarterly',
        period: 1,
        year: 2025
      }
    })
  })

  it('allows re-creating the first submission after the initial draft is deleted', async () => {
    const { server, organisationId, registrationId } = await createServer({
      wasteProcessingType: 'reprocessor',
      accreditationId: undefined
    })

    const first = await makeRequest(server, organisationId, registrationId)
    expect(first.statusCode).toBe(StatusCodes.CREATED)
    const firstId = JSON.parse(first.payload).id

    const deleted = await server.inject({
      method: 'DELETE',
      url: makeUrl(organisationId, registrationId, 2025, 'quarterly', 1, 1),
      ...asOperator()
    })
    expect(deleted.statusCode).toBe(StatusCodes.NO_CONTENT)

    const recreated = await makeRequest(server, organisationId, registrationId)

    expect(recreated.statusCode).toBe(StatusCodes.CREATED)
    const payload = JSON.parse(recreated.payload)
    expect(payload.submissionNumber).toBe(1)
    expect(payload.id).not.toBe(firstId)
  })

  it('returns 404 when registration not found', async () => {
    const { server, organisationId } = await createServer()
    const unknownRegId = new ObjectId().toString()

    const response = await makeRequest(server, organisationId, unknownRegId)

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('creates report for non-glass material registration', async () => {
    const { server, organisationId, registrationId } = await createServer({
      wasteProcessingType: 'exporter',
      accreditationId: undefined
    })

    const response = await makeRequest(
      server,
      organisationId,
      registrationId,
      2025,
      'quarterly',
      1
    )

    expect(response.statusCode).toBe(StatusCodes.CREATED)
    const payload = JSON.parse(response.payload)
    expect(payload.material).toBe('plastic')
  })

  it('returns 400 with structured invalidPeriod when period exceeds the cadence range', async () => {
    const { server, organisationId, registrationId } = await createServer({
      wasteProcessingType: 'reprocessor',
      accreditationId: undefined
    })

    const response = await makeRequest(
      server,
      organisationId,
      registrationId,
      2025,
      'quarterly',
      5
    )

    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    expect(JSON.parse(response.payload)).toEqual({
      statusCode: StatusCodes.BAD_REQUEST,
      error: 'Bad Request',
      message: 'Invalid period 5 for cadence quarterly',
      invalidPeriod: {
        actual: 5,
        cadence: 'quarterly',
        validPeriods: [1, 2, 3, 4]
      }
    })
  })

  it('returns 400 with structured periodNotEnded when the period has not yet ended', async () => {
    const { server, organisationId, registrationId } = await createServer({
      wasteProcessingType: 'reprocessor',
      accreditationId: undefined
    })

    const response = await makeRequest(
      server,
      organisationId,
      registrationId,
      2099,
      'quarterly',
      1
    )

    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    expect(JSON.parse(response.payload)).toEqual({
      statusCode: StatusCodes.BAD_REQUEST,
      error: 'Bad Request',
      message: 'Cannot create report for period 1 — period has not yet ended',
      periodNotEnded: {
        period: 1,
        cadence: 'quarterly',
        endDate: '2099-03-31',
        earliestSubmissionDate: '2099-04-01T00:00:00.000Z'
      }
    })
  })

  it('returns 400 with structured cadence when accredited registration uses quarterly cadence', async () => {
    const accreditationId = new ObjectId().toString()
    const registration = buildRegistration({
      wasteProcessingType: 'reprocessor',
      accreditationId
    })
    const org = buildOrganisationWithRegistration(registration, 'approved')
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([org])

    const server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        wasteRecordsRepository: createInMemoryWasteRecordsRepository([]),
        reportsRepository: createInMemoryReportsRepository()
      },
      featureFlags: createInMemoryFeatureFlags()
    })

    const response = await makeRequest(
      server,
      org.id,
      registration.id,
      2025,
      'quarterly',
      1
    )

    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    expect(JSON.parse(response.payload)).toEqual({
      statusCode: StatusCodes.BAD_REQUEST,
      error: 'Bad Request',
      message:
        "Cadence 'quarterly' does not match registration type — expected 'monthly'",
      cadence: { actual: 'quarterly', expected: 'monthly' }
    })
  })

  it('returns 400 with structured cadence when registered-only registration uses monthly cadence', async () => {
    const { server, organisationId, registrationId } = await createServer({
      wasteProcessingType: 'reprocessor',
      accreditationId: undefined
    })

    const response = await makeRequest(
      server,
      organisationId,
      registrationId,
      2025,
      'monthly',
      1
    )

    expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    expect(JSON.parse(response.payload)).toEqual({
      statusCode: StatusCodes.BAD_REQUEST,
      error: 'Bad Request',
      message:
        "Cadence 'monthly' does not match registration type — expected 'quarterly'",
      cadence: { actual: 'monthly', expected: 'quarterly' }
    })
  })

  describe('indexed warn log shape per helper', () => {
    it('cadence mismatch attaches CADENCE_MISMATCH code and cadence event.reason', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      await makeRequest(
        server,
        organisationId,
        registrationId,
        2025,
        'monthly',
        1
      )

      expect(server.loggerMocks.warn).toHaveBeenCalledWith({
        message:
          "Cadence 'monthly' does not match registration type — expected 'quarterly'",
        error: {
          code: 'cadence_mismatch',
          id: expect.any(String),
          message:
            "Cadence 'monthly' does not match registration type — expected 'quarterly'",
          stack_trace: expect.any(String),
          type: 'Bad Request'
        },
        event: {
          category: LOGGING_EVENT_CATEGORIES.HTTP,
          action: 'create_report',
          kind: 'event',
          outcome: 'failure',
          reason: 'actual=monthly expected=quarterly'
        },
        http: { response: { status_code: StatusCodes.BAD_REQUEST } }
      })
    })

    it('invalid period attaches INVALID_PERIOD code and flat event.reason', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      await makeRequest(
        server,
        organisationId,
        registrationId,
        2025,
        'quarterly',
        5
      )

      expect(server.loggerMocks.warn).toHaveBeenCalledWith({
        message: 'Invalid period 5 for cadence quarterly',
        error: {
          code: 'invalid_period',
          id: expect.any(String),
          message: 'Invalid period 5 for cadence quarterly',
          stack_trace: expect.any(String),
          type: 'Bad Request'
        },
        event: {
          category: LOGGING_EVENT_CATEGORIES.HTTP,
          action: 'create_report',
          kind: 'event',
          outcome: 'failure',
          reason: 'actual=5 cadence=quarterly validPeriods=[1,2,3,4]'
        },
        http: { response: { status_code: StatusCodes.BAD_REQUEST } }
      })
    })

    it('period not ended attaches PERIOD_NOT_ENDED code and flat event.reason', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      await makeRequest(
        server,
        organisationId,
        registrationId,
        2099,
        'quarterly',
        1
      )

      expect(server.loggerMocks.warn).toHaveBeenCalledWith({
        message: 'Cannot create report for period 1 — period has not yet ended',
        error: {
          code: 'period_not_ended',
          id: expect.any(String),
          message:
            'Cannot create report for period 1 — period has not yet ended',
          stack_trace: expect.any(String),
          type: 'Bad Request'
        },
        event: {
          category: LOGGING_EVENT_CATEGORIES.HTTP,
          action: 'create_report',
          kind: 'event',
          outcome: 'failure',
          reason:
            'period=1 cadence=quarterly endDate=2099-03-31 earliestSubmissionDate=2099-04-01T00:00:00.000Z'
        },
        http: { response: { status_code: StatusCodes.BAD_REQUEST } }
      })
    })

    it('report already exists attaches REPORT_ALREADY_EXISTS code and existingId as event.reference', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      const first = await makeRequest(server, organisationId, registrationId)
      const existingId = JSON.parse(first.payload).id

      await makeRequest(server, organisationId, registrationId)

      expect(server.loggerMocks.warn).toHaveBeenCalledWith({
        message: 'Report already exists for quarterly period 1 of 2025',
        error: {
          code: 'report_already_exists',
          id: expect.any(String),
          message: 'Report already exists for quarterly period 1 of 2025',
          stack_trace: expect.any(String),
          type: 'Conflict'
        },
        event: {
          category: LOGGING_EVENT_CATEGORIES.HTTP,
          action: 'create_report',
          kind: 'event',
          outcome: 'failure',
          reason: 'cadence=quarterly period=1 year=2025',
          reference: existingId
        },
        http: { response: { status_code: StatusCodes.CONFLICT } }
      })
    })
  })

  it('returns 422 for invalid cadence', async () => {
    const { server, organisationId, registrationId } = await createServer({
      wasteProcessingType: 'reprocessor',
      accreditationId: undefined
    })

    const response = await server.inject({
      method: 'POST',
      url: makeUrl(organisationId, registrationId, 2025, 'biweekly', 1, 1),
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  describe('error handling', () => {
    beforeEach(() => vi.clearAllMocks())

    it('logs error details when an unexpected error occurs', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      const unexpectedError = new Error('unexpected failure')
      vi.mocked(reportAudit.auditReportCreate).mockRejectedValueOnce(
        unexpectedError
      )

      const response = await makeRequest(server, organisationId, registrationId)

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      expect(server.loggerMocks.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: unexpectedError,
          message: `Failure on ${reportsPostPath}`,
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
      )
    })

    it('routes an expected 4xx boom to warn (not error) with full structured event', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      const first = await makeRequest(server, organisationId, registrationId)
      const existingId = JSON.parse(first.payload).id
      const response = await makeRequest(server, organisationId, registrationId)

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(server.loggerMocks.error).not.toHaveBeenCalled()
      expect(server.loggerMocks.warn).toHaveBeenCalledWith({
        message: 'Report already exists for quarterly period 1 of 2025',
        error: {
          code: 'report_already_exists',
          id: expect.any(String),
          message: 'Report already exists for quarterly period 1 of 2025',
          stack_trace: expect.any(String),
          type: 'Conflict'
        },
        event: {
          category: LOGGING_EVENT_CATEGORIES.HTTP,
          action: 'create_report',
          kind: 'event',
          outcome: 'failure',
          reason: 'cadence=quarterly period=1 year=2025',
          reference: existingId
        },
        http: { response: { status_code: StatusCodes.CONFLICT } }
      })
    })
  })

  describe('auditing', () => {
    beforeEach(() => vi.clearAllMocks())

    it('calls auditReportCreate with correct params on success', async () => {
      const { server, organisationId, registrationId } = await createServer({
        wasteProcessingType: 'reprocessor',
        accreditationId: undefined
      })

      await makeRequest(server, organisationId, registrationId)

      expect(reportAudit.auditReportCreate).toHaveBeenCalledWith(
        expect.any(Object),
        {
          organisationId,
          registrationId,
          year: 2025,
          cadence: 'quarterly',
          period: 1,
          submissionNumber: expect.anything(),
          reportId: expect.any(String),
          createdAt: expect.any(String)
        }
      )
    })
  })

  it('includes prn issuedTonnage when creating report for accredited registration', async () => {
    const accreditationId = new ObjectId().toString()
    const issuedAt = new Date('2025-01-15T00:00:00.000Z')

    const prn = {
      ...buildAwaitingAcceptancePrn({
        accreditation: {
          id: accreditationId,
          accreditationNumber: 'ACC-TEST-001',
          accreditationYear: 2025,
          material: 'glass',
          glassRecyclingProcess: 'glass_re_melt',
          submittedToRegulator: 'ea',
          siteAddress: { line1: '1 Test Street', postcode: 'SW1A 1AA' }
        },
        tonnage: 250,
        status: {
          currentStatus: 'awaiting_acceptance',
          currentStatusAt: issuedAt,
          issued: {
            at: issuedAt,
            by: { id: 'issuer', name: 'Issuer', position: 'Manager' }
          },
          history: []
        }
      }),
      id: new ObjectId().toString()
    }

    const registration = buildRegistration({
      wasteProcessingType: 'reprocessor',
      accreditationId
    })
    const org = buildOrganisationWithRegistration(registration, 'approved')
    const organisationsRepositoryFactory =
      createInMemoryOrganisationsRepository([org])

    const server = await createTestServer({
      repositories: {
        organisationsRepository: organisationsRepositoryFactory,
        wasteRecordsRepository: createInMemoryWasteRecordsRepository([
          {
            id: new ObjectId().toString(),
            organisationId: org.id,
            registrationId: registration.id,
            type: 'received',
            data: {},
            versions: [
              {
                createdAt: '2024-01-15T00:00:00.000Z',
                summaryLog: { id: 'sl-1' }
              }
            ]
          }
        ]),
        reportsRepository: createInMemoryReportsRepository(),
        packagingRecyclingNotesRepository:
          createInMemoryPackagingRecyclingNotesRepository([prn])
      },
      featureFlags: createInMemoryFeatureFlags()
    })

    const response = await server.inject({
      method: 'POST',
      url: makeUrl(org.id, registration.id, 2025, 'monthly', 1, 1),
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.CREATED)
    const payload = JSON.parse(response.payload)
    expect(payload.prn).toStrictEqual({ issuedTonnage: 250 })
  })

  describe('resubmission submissions (submissionNumber > 1)', () => {
    const CLOSED_PERIOD_ADJUSTMENTS = 'featureFlags.closedPeriodAdjustments'
    const changedBy = { id: 'user-1', name: 'Test', position: 'Officer' }

    afterEach(() => {
      config.set(CLOSED_PERIOD_ADJUSTMENTS, false)
    })

    const buildSubmission = (
      organisationId,
      registrationId,
      submissionNumber
    ) => ({
      organisationId,
      registrationId,
      year: 2025,
      cadence: 'quarterly',
      period: 1,
      startDate: '2025-01-01',
      endDate: '2025-03-31',
      dueDate: '2025-05-20',
      changedBy,
      submissionNumber,
      material: 'plastic',
      wasteProcessingType: 'exporter',
      source: { summaryLogId: 'sl-1', lastUploadedAt: '2025-01-15' },
      prn: null,
      recyclingActivity: {
        suppliers: [],
        totalTonnageReceived: 0,
        tonnageRecycled: null,
        tonnageNotRecycled: null
      },
      wasteSent: {
        tonnageSentToReprocessor: 0,
        tonnageSentToExporter: 0,
        tonnageSentToAnotherSite: 0,
        finalDestinations: []
      }
    })

    const submitReport = async (repo, id) => {
      await repo.updateReportStatus({
        reportId: id,
        version: 1,
        status: REPORT_STATUS.READY_TO_SUBMIT,
        slot: REPORT_STATUS_SLOT.READY,
        changedBy
      })
      await repo.updateReportStatus({
        reportId: id,
        version: 2,
        status: REPORT_STATUS.SUBMITTED,
        slot: REPORT_STATUS_SLOT.SUBMITTED,
        changedBy,
        submissionDeclaredBy: 'Test User'
      })
    }

    const flagPeriod = (repo, organisationId, registrationId) =>
      repo.markSubmittedReportsRequiringResubmission({
        organisationId,
        registrationId,
        summaryLogId: 'sl-2',
        uploadedAt: '2025-06-01T12:00:00.000Z',
        periods: [{ year: 2025, cadence: 'quarterly', period: 1 }]
      })

    const setup = async () => {
      const {
        server,
        organisationId,
        registrationId,
        reportsRepositoryFactory
      } = await createServer({
        wasteProcessingType: 'exporter',
        accreditationId: undefined
      })
      return {
        server,
        organisationId,
        registrationId,
        repo: reportsRepositoryFactory()
      }
    }

    const postSubmission = (server, organisationId, registrationId, n) =>
      makeRequest(
        server,
        organisationId,
        registrationId,
        2025,
        'quarterly',
        1,
        n
      )

    it('creates submission 2 when the flag is on and submission 1 is submitted and flagged', async () => {
      config.set(CLOSED_PERIOD_ADJUSTMENTS, true)
      const { server, organisationId, registrationId, repo } = await setup()

      const { id } = await repo.createReport(
        buildSubmission(organisationId, registrationId, 1)
      )
      await submitReport(repo, id)
      await flagPeriod(repo, organisationId, registrationId)

      const response = await postSubmission(
        server,
        organisationId,
        registrationId,
        2
      )

      expect(response.statusCode).toBe(StatusCodes.CREATED)
      expect(JSON.parse(response.payload).submissionNumber).toBe(2)
    })

    it('rejects submission 2 with 409 resubmission_feature_disabled when the flag is off', async () => {
      const { server, organisationId, registrationId, repo } = await setup()

      const { id } = await repo.createReport(
        buildSubmission(organisationId, registrationId, 1)
      )
      await submitReport(repo, id)
      await flagPeriod(repo, organisationId, registrationId)

      const response = await postSubmission(
        server,
        organisationId,
        registrationId,
        2
      )

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(response.payload).reason).toBe(
        'resubmission_feature_disabled'
      )
    })

    it('rejects submission 2 with 409 resubmission_not_permitted when submission 1 is submitted but not flagged', async () => {
      config.set(CLOSED_PERIOD_ADJUSTMENTS, true)
      const { server, organisationId, registrationId, repo } = await setup()

      const { id } = await repo.createReport(
        buildSubmission(organisationId, registrationId, 1)
      )
      await submitReport(repo, id)

      const response = await postSubmission(
        server,
        organisationId,
        registrationId,
        2
      )

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(response.payload).reason).toBe(
        'resubmission_not_permitted'
      )
    })

    it('rejects submission 2 with 409 resubmission_not_permitted when submission 1 is still in progress', async () => {
      config.set(CLOSED_PERIOD_ADJUSTMENTS, true)
      const { server, organisationId, registrationId, repo } = await setup()

      await repo.createReport(
        buildSubmission(organisationId, registrationId, 1)
      )

      const response = await postSubmission(
        server,
        organisationId,
        registrationId,
        2
      )

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(response.payload).reason).toBe(
        'resubmission_not_permitted'
      )
    })

    it('rejects submission 2 with 409 resubmission_not_permitted when no submission 1 exists', async () => {
      config.set(CLOSED_PERIOD_ADJUSTMENTS, true)
      const { server, organisationId, registrationId } = await setup()

      const response = await postSubmission(
        server,
        organisationId,
        registrationId,
        2
      )

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(response.payload).reason).toBe(
        'resubmission_not_permitted'
      )
    })

    it('rejects submission 3 when submission 2 is not yet submitted', async () => {
      config.set(CLOSED_PERIOD_ADJUSTMENTS, true)
      const { server, organisationId, registrationId, repo } = await setup()

      const { id } = await repo.createReport(
        buildSubmission(organisationId, registrationId, 1)
      )
      await submitReport(repo, id)
      await flagPeriod(repo, organisationId, registrationId)
      await repo.createReport(
        buildSubmission(organisationId, registrationId, 2)
      )

      const response = await postSubmission(
        server,
        organisationId,
        registrationId,
        3
      )

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(response.payload).reason).toBe(
        'resubmission_not_permitted'
      )
    })

    it('returns report_already_exists when a submission 2 already exists, even with the flag off', async () => {
      const { server, organisationId, registrationId, repo } = await setup()

      const { id } = await repo.createReport(
        buildSubmission(organisationId, registrationId, 1)
      )
      await submitReport(repo, id)
      await flagPeriod(repo, organisationId, registrationId)
      const { id: existingDraftId } = await repo.createReport(
        buildSubmission(organisationId, registrationId, 2)
      )

      const response = await postSubmission(
        server,
        organisationId,
        registrationId,
        2
      )

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      const payload = JSON.parse(response.payload)
      expect(payload.reason).toBeUndefined()
      expect(payload.existingReport).toMatchObject({
        id: existingDraftId,
        cadence: 'quarterly',
        period: 1,
        year: 2025
      })
    })
  })
})

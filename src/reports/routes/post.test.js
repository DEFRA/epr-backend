import { ObjectId } from 'mongodb'
import { calendarDate } from '#common/helpers/date-formatter.js'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { buildSummaryLogRowStateEntry } from '#waste-records/repository/test-data.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import { fetchReportBySubmissionNumber } from '#reports/application/report-service.js'
import { createInMemoryPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/inmemory.plugin.js'
import { buildAwaitingAcceptancePrn } from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  accreditation,
  exporter,
  exporterAccreditation,
  granted,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { reportsPostFailureMessage } from './post.js'
import { MAX_ISSUES_REPORTED } from '#reports/application/report-mandatory/assert-report-data-complete.js'
import * as reportAudit from '#reports/application/audit.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import { SummaryLogRowStateEntry } from '#waste-records/repository/schema.js' */
/** @import { PackagingRecyclingNote } from '#packaging-recycling-notes/domain/model.js' */

vi.mock('#reports/application/audit.js', () => ({
  auditReportCreate: vi.fn().mockResolvedValue(undefined),
  auditReportDelete: vi.fn().mockResolvedValue(undefined)
}))

const YEAR = 2026
const QUARTER = 1
// The accreditation from the read-model fixtures starts in July.
const MONTH = 7

describe('POST /organisations/{organisationNumber}/registrations/{registrationNumber}/.../submissions/{submissionNumber}', () => {
  setupAuthContext()

  const SUMMARY_LOG_ID = 'sl-1'
  const SUBMITTED_AT = new Date('2024-01-15T00:00:00.000Z')

  /**
   * Seeds the summary-log row states and the waste balance ledger so the report
   * routes resolve one committed row at the latest submitted summary log for the
   * registration.
   */
  const DEFAULT_ROWS = [
    buildSummaryLogRowStateEntry({
      rowId: 'row-0',
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      data: {}
    })
  ]

  /**
   * @param {{ id: string }} org
   * @param {Record<string, any>} registration
   * @param {SummaryLogRowStateEntry[]} [rows]
   */
  const seedRepositories = async (org, registration, rows = DEFAULT_ROWS) => {
    const accreditationId = registration.accreditationId ?? null
    const ledgerId = {
      organisationId: org.id,
      registrationId: registration.id,
      accreditationId
    }
    const summaryLogRowStatesRepository =
      createInMemorySummaryLogRowStatesRepository()()
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      ledgerId,
      rows,
      SUMMARY_LOG_ID
    )
    const ledgerRepository = createInMemoryLedgerRepository([
      partialMock(
        buildLedgerEvent({
          organisationId: org.id,
          registrationId: registration.id,
          accreditationId,
          number: 1,
          createdAt: SUBMITTED_AT,
          payload: { summaryLogId: SUMMARY_LOG_ID, creditTotal: 100 }
        })
      )
    ])()
    return { ledgerRepository, summaryLogRowStatesRepository }
  }

  /**
   * @param {object} [registrationOverrides]
   * @param {object} [options]
   * @param {boolean} [options.reportDataValidationEnabled]
   * @param {SummaryLogRowStateEntry[]} [options.rows]
   * @param {boolean} [options.accredited] - Report through the accreditation (monthly cadence).
   * @param {object} [options.accreditationOverrides]
   * @param {(ids: { organisationId: string, registrationId: string, accreditationId: string }) => PackagingRecyclingNote[]} [options.prns]
   */
  const createServer = async (
    registrationOverrides = {},
    {
      reportDataValidationEnabled = false,
      rows,
      accredited = false,
      accreditationOverrides = {},
      prns = () => []
    } = {}
  ) => {
    const isExporter =
      /** @type {{ wasteProcessingType?: string }} */ (registrationOverrides)
        .wasteProcessingType === 'exporter'
    const accreditationRecord = accredited
      ? (isExporter ? exporterAccreditation : accreditation)(
          accreditationOverrides
        )
      : undefined
    const registration = (isExporter ? exporter : reprocessor)({
      ...registrationOverrides,
      ...(accreditationRecord && { accreditationId: accreditationRecord.id })
    })
    const org = buildOrganisation({
      registrations: [registration],
      ...(accreditationRecord && { accreditations: [accreditationRecord] })
    })

    const { ledgerRepository, summaryLogRowStatesRepository } =
      await seedRepositories(org, registration, rows)
    const reportsRepositoryFactory = createInMemoryReportsRepository()

    const server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(org)
        ]),
        ledgerRepository,
        summaryLogRowStatesRepository,
        reportsRepository: reportsRepositoryFactory,
        packagingRecyclingNotesRepository:
          createInMemoryPackagingRecyclingNotesRepository(
            prns({
              organisationId: org.id,
              registrationId: registration.id,
              accreditationId: /** @type {string} */ (accreditationRecord?.id)
            })
          )
      },
      config: {
        featureFlags: { reportDataValidation: reportDataValidationEnabled }
      }
    })

    const registrationPath = `/organisations/${org.orgId}/registrations/${registration.registrationNumber}`

    /**
     * @param {{ year?: number, period?: number, submissionNumber?: number }} [submission]
     */
    const url = ({
      year = YEAR,
      period = accredited ? MONTH : QUARTER,
      submissionNumber = 1
    } = {}) =>
      accredited
        ? `${registrationPath}/accreditations/${year}/reports/monthly/${period}/submissions/${submissionNumber}`
        : `${registrationPath}/reports/${year}/quarterly/${period}/submissions/${submissionNumber}`

    return {
      server,
      organisationId: org.id,
      registrationId: registration.id,
      organisationNumber: String(org.orgId),
      registrationNumber: registration.registrationNumber,
      accreditationNumber: accreditationRecord?.accreditationNumber,
      reportsRepositoryFactory,
      url,
      /** @param {{ year?: number, period?: number, submissionNumber?: number }} [submission] */
      post: (submission) =>
        server.inject({
          method: 'POST',
          url: url(submission),
          ...asOperator()
        }),
      /** @param {{ year?: number, period?: number, submissionNumber?: number }} [submission] */
      get: (submission) =>
        server.inject({ method: 'GET', url: url(submission), ...asOperator() })
    }
  }

  /**
   * The id of the stored registered-only report for the quarter.
   * @param {Awaited<ReturnType<typeof createServer>>} created
   * @param {number} [submissionNumber]
   */
  const storedQuarterlyReport = (
    { reportsRepositoryFactory, organisationId, registrationId },
    submissionNumber = 1
  ) =>
    fetchReportBySubmissionNumber(
      reportsRepositoryFactory(),
      organisationId,
      registrationId,
      YEAR,
      'quarterly',
      QUARTER,
      submissionNumber
    )

  const registeredOnlyReprocessor = { wasteProcessingType: 'reprocessor' }

  /** An accreditation the read model still serves but which is no longer live. */
  const cancelledAccreditation = {
    status: 'cancelled',
    statusHistory: granted('cancelled')
  }

  it('returns 201 with created report including data sections', async () => {
    const created = await createServer(registeredOnlyReprocessor)

    const response = await created.post()

    expect(response.statusCode).toBe(StatusCodes.CREATED)
    const payload = JSON.parse(response.payload)
    expect(payload).toMatchObject({
      year: YEAR,
      cadence: 'quarterly',
      period: QUARTER,
      submissionNumber: 1,
      status: REPORT_STATUS.IN_PROGRESS,
      createdAt: expect.any(String)
    })
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

    const stored = await storedQuarterlyReport(created)
    expect(stored).toMatchObject({
      material: 'glass_re_melt',
      wasteProcessingType: 'reprocessor'
    })
  })

  it('stores the organisation and registration numbers beside their ids, and a null accreditation number', async () => {
    const created = await createServer(registeredOnlyReprocessor)

    await created.post()

    expect(await storedQuarterlyReport(created)).toMatchObject({
      organisationId: created.organisationId,
      organisationNumber: created.organisationNumber,
      registrationId: created.registrationId,
      registrationNumber: created.registrationNumber,
      accreditationNumber: null
    })
  })

  it('stores the accreditation number on a report made through the accreditation', async () => {
    const created = await createServer(registeredOnlyReprocessor, {
      accredited: true
    })

    await created.post()

    expect(
      await fetchReportBySubmissionNumber(
        created.reportsRepositoryFactory(),
        created.organisationId,
        created.registrationId,
        YEAR,
        'monthly',
        MONTH,
        1
      )
    ).toMatchObject({ accreditationNumber: created.accreditationNumber })
    expect(created.accreditationNumber).toBeDefined()
  })

  it('returns 409 with structured existingReport when a report for the same period already exists', async () => {
    const created = await createServer(registeredOnlyReprocessor)

    await created.post()
    const existing = await storedQuarterlyReport(created)
    const response = await created.post()

    expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    expect(JSON.parse(response.payload)).toEqual({
      statusCode: StatusCodes.CONFLICT,
      error: 'Conflict',
      message: `Report already exists for quarterly period 1 of ${YEAR}`,
      existingReport: {
        id: existing?.id,
        cadence: 'quarterly',
        period: QUARTER,
        year: YEAR
      }
    })
  })

  it('allows re-creating the first submission after the initial draft is deleted', async () => {
    const created = await createServer(registeredOnlyReprocessor)
    const { organisationId, registrationId, reportsRepositoryFactory } = created

    const first = await created.post()
    expect(first.statusCode).toBe(StatusCodes.CREATED)
    const firstId = (await storedQuarterlyReport(created))?.id

    await reportsRepositoryFactory().deleteReport({
      organisationId,
      registrationId,
      year: YEAR,
      cadence: 'quarterly',
      period: QUARTER,
      submissionNumber: 1,
      changedBy: { id: 'test', name: 'Test', position: 'Officer' }
    })

    const recreated = await created.post()

    expect(recreated.statusCode).toBe(StatusCodes.CREATED)
    expect(JSON.parse(recreated.payload).submissionNumber).toBe(1)
    expect((await storedQuarterlyReport(created))?.id).not.toBe(firstId)
  })

  it('creates report for non-glass material registration', async () => {
    const created = await createServer({ wasteProcessingType: 'exporter' })

    const response = await created.post()

    expect(response.statusCode).toBe(StatusCodes.CREATED)
    const stored = await storedQuarterlyReport(created)
    expect(stored?.material).toBe('plastic')
    expect(stored?.wasteProcessingType).toBe('exporter')
  })

  it('returns 400 with structured invalidPeriod when period exceeds the cadence range', async () => {
    const { post } = await createServer(registeredOnlyReprocessor)

    const response = await post({ period: 5 })

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
    const { post } = await createServer(registeredOnlyReprocessor)

    const response = await post({ year: 2099 })

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

  it('returns 400 with structured cadence when the accreditation for the year is no longer live', async () => {
    const { post } = await createServer(registeredOnlyReprocessor, {
      accredited: true,
      accreditationOverrides: cancelledAccreditation
    })

    const response = await post()

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
      const { server, post } = await createServer(registeredOnlyReprocessor, {
        accredited: true,
        accreditationOverrides: cancelledAccreditation
      })

      await post()

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
      const { server, post } = await createServer(registeredOnlyReprocessor)

      await post({ period: 5 })

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
      const { server, post } = await createServer(registeredOnlyReprocessor)

      await post({ year: 2099 })

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
      const created = await createServer(registeredOnlyReprocessor)

      await created.post()
      const existingId = (await storedQuarterlyReport(created))?.id

      await created.post()

      expect(created.server.loggerMocks.warn).toHaveBeenCalledWith({
        message: `Report already exists for quarterly period 1 of ${YEAR}`,
        error: {
          code: 'report_already_exists',
          id: expect.any(String),
          message: `Report already exists for quarterly period 1 of ${YEAR}`,
          stack_trace: expect.any(String),
          type: 'Conflict'
        },
        event: {
          category: LOGGING_EVENT_CATEGORIES.HTTP,
          action: 'create_report',
          kind: 'event',
          outcome: 'failure',
          reason: `cadence=quarterly period=1 year=${YEAR}`,
          reference: existingId
        },
        http: { response: { status_code: StatusCodes.CONFLICT } }
      })
    })
  })

  it('returns 422 for invalid cadence', async () => {
    const { server, url } = await createServer(registeredOnlyReprocessor)

    const response = await server.inject({
      method: 'POST',
      url: url().replace('/quarterly/', '/biweekly/'),
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  describe('error handling', () => {
    beforeEach(() => vi.clearAllMocks())

    it('logs error details when an unexpected error occurs', async () => {
      const { server, post } = await createServer(registeredOnlyReprocessor)

      const unexpectedError = new Error('unexpected failure')
      vi.mocked(reportAudit.auditReportCreate).mockRejectedValueOnce(
        unexpectedError
      )

      const response = await post()

      expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
      expect(server.loggerMocks.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: unexpectedError,
          message: reportsPostFailureMessage,
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
      const created = await createServer(registeredOnlyReprocessor)

      await created.post()
      const existingId = (await storedQuarterlyReport(created))?.id
      const response = await created.post()

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(created.server.loggerMocks.error).not.toHaveBeenCalled()
      expect(created.server.loggerMocks.warn).toHaveBeenCalledWith({
        message: `Report already exists for quarterly period 1 of ${YEAR}`,
        error: {
          code: 'report_already_exists',
          id: expect.any(String),
          message: `Report already exists for quarterly period 1 of ${YEAR}`,
          stack_trace: expect.any(String),
          type: 'Conflict'
        },
        event: {
          category: LOGGING_EVENT_CATEGORIES.HTTP,
          action: 'create_report',
          kind: 'event',
          outcome: 'failure',
          reason: `cadence=quarterly period=1 year=${YEAR}`,
          reference: existingId
        },
        http: { response: { status_code: StatusCodes.CONFLICT } }
      })
    })
  })

  describe('auditing', () => {
    beforeEach(() => vi.clearAllMocks())

    it('calls auditReportCreate with correct params on success', async () => {
      const { organisationId, registrationId, post } = await createServer(
        registeredOnlyReprocessor
      )

      await post()

      expect(reportAudit.auditReportCreate).toHaveBeenCalledWith(
        expect.any(Object),
        {
          organisationId,
          registrationId,
          year: YEAR,
          cadence: 'quarterly',
          period: QUARTER,
          submissionNumber: expect.anything(),
          reportId: expect.any(String),
          createdAt: expect.any(String)
        }
      )
    })
  })

  it('includes prn issuedTonnage when creating report for accredited registration', async () => {
    const issuedAt = new Date('2026-07-15T00:00:00.000Z')

    const { post } = await createServer(registeredOnlyReprocessor, {
      accredited: true,
      prns: ({ organisationId, registrationId, accreditationId }) => [
        {
          ...buildAwaitingAcceptancePrn({
            organisation: { id: organisationId, name: 'Test Organisation' },
            registrationId,
            accreditation: {
              id: accreditationId,
              accreditationNumber: 'ACC-TEST-001',
              accreditationYear: YEAR,
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
      ]
    })

    const response = await post()

    expect(response.statusCode).toBe(StatusCodes.CREATED)
    const payload = JSON.parse(response.payload)
    expect(payload.prn).toStrictEqual({ issuedTonnage: 250 })
  })

  describe('resubmission submissions (submissionNumber > 1)', () => {
    const changedBy = { id: 'user-1', name: 'Test', position: 'Officer' }

    const buildSubmission = (
      organisationId,
      registrationId,
      submissionNumber
    ) => ({
      organisationId,
      registrationId,
      year: YEAR,
      cadence: 'quarterly',
      period: QUARTER,
      startDate: calendarDate('2026-01-01'),
      endDate: calendarDate('2026-03-31'),
      dueDate: calendarDate('2026-05-20'),
      changedBy,
      submissionNumber,
      material: 'plastic',
      wasteProcessingType: 'exporter',
      source: { summaryLogId: 'sl-1', lastUploadedAt: '2026-01-15' },
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
        uploadedAt: '2026-06-01T12:00:00.000Z',
        periods: [{ year: YEAR, cadence: 'quarterly', period: QUARTER }]
      })

    const setup = async () => {
      const { organisationId, registrationId, reportsRepositoryFactory, post } =
        await createServer({ wasteProcessingType: 'exporter' })
      return {
        organisationId,
        registrationId,
        repo: reportsRepositoryFactory(),
        /** @param {number} submissionNumber */
        postSubmission: (submissionNumber) => post({ submissionNumber })
      }
    }

    it('creates submission 2 when submission 1 is submitted and flagged', async () => {
      const { organisationId, registrationId, repo, postSubmission } =
        await setup()

      const { id } = await repo.createReport(
        buildSubmission(organisationId, registrationId, 1)
      )
      await submitReport(repo, id)
      await flagPeriod(repo, organisationId, registrationId)

      const response = await postSubmission(2)

      expect(response.statusCode).toBe(StatusCodes.CREATED)
      expect(JSON.parse(response.payload).submissionNumber).toBe(2)
    })

    it('rejects submission 2 with 409 resubmission_not_permitted when submission 1 is submitted but not flagged', async () => {
      const { organisationId, registrationId, repo, postSubmission } =
        await setup()

      const { id } = await repo.createReport(
        buildSubmission(organisationId, registrationId, 1)
      )
      await submitReport(repo, id)

      const response = await postSubmission(2)

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(response.payload).reason).toBe(
        'resubmission_not_permitted'
      )
    })

    it('rejects submission 2 with 409 resubmission_not_permitted when submission 1 is still in progress', async () => {
      const { organisationId, registrationId, repo, postSubmission } =
        await setup()

      await repo.createReport(
        buildSubmission(organisationId, registrationId, 1)
      )

      const response = await postSubmission(2)

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(response.payload).reason).toBe(
        'resubmission_not_permitted'
      )
    })

    it('rejects submission 2 with 409 resubmission_not_permitted when no submission 1 exists', async () => {
      const { postSubmission } = await setup()

      const response = await postSubmission(2)

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(response.payload).reason).toBe(
        'resubmission_not_permitted'
      )
    })

    it('rejects submission 3 when submission 2 is not yet submitted', async () => {
      const { organisationId, registrationId, repo, postSubmission } =
        await setup()

      const { id } = await repo.createReport(
        buildSubmission(organisationId, registrationId, 1)
      )
      await submitReport(repo, id)
      await flagPeriod(repo, organisationId, registrationId)
      await repo.createReport(
        buildSubmission(organisationId, registrationId, 2)
      )

      const response = await postSubmission(3)

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(response.payload).reason).toBe(
        'resubmission_not_permitted'
      )
    })

    it('returns report_already_exists when a submission 2 already exists, even with the flag off', async () => {
      const { organisationId, registrationId, repo, postSubmission } =
        await setup()

      const { id } = await repo.createReport(
        buildSubmission(organisationId, registrationId, 1)
      )
      await submitReport(repo, id)
      await flagPeriod(repo, organisationId, registrationId)
      const { id: existingDraftId } = await repo.createReport(
        buildSubmission(organisationId, registrationId, 2)
      )

      const response = await postSubmission(2)

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      const payload = JSON.parse(response.payload)
      expect(payload.reason).toBeUndefined()
      expect(payload.existingReport).toMatchObject({
        id: existingDraftId,
        cadence: 'quarterly',
        period: QUARTER,
        year: YEAR
      })
    })
  })

  describe('exporter report data completeness gate (PAE-1420)', () => {
    // The six supplier fields AC1 makes mandatory, in the order the gate reports
    // them. Kept as a list so the accredited/reg-only assertions read the same.
    const SUPPLIER_FIELDS = [
      'SUPPLIER_NAME',
      'SUPPLIER_ADDRESS',
      'SUPPLIER_POSTCODE',
      'SUPPLIER_EMAIL',
      'SUPPLIER_PHONE_NUMBER',
      'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER'
    ]

    // Row-state entries are keyed by the canonical field names ingestion
    // normalises both templates to; the gate reads only this data, never the
    // template. Accredited packs everything onto one exported row; reg-only
    // splits it across received/loads-exported/sent-on rows.
    /**
     * @param {Record<string, any>} data
     * @param {string} [wasteRecordType]
     */
    const accreditedRow = (
      data,
      wasteRecordType = WASTE_RECORD_TYPE.EXPORTED
    ) =>
      buildSummaryLogRowStateEntry({
        rowId: 'row-1',
        wasteRecordType,
        processingType: PROCESSING_TYPES.EXPORTER,
        data
      })

    const regOnlyRow = (rowId, wasteRecordType, data) =>
      buildSummaryLogRowStateEntry({
        rowId,
        wasteRecordType,
        processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
        data
      })

    const exporterRegistration = { wasteProcessingType: 'exporter' }

    // The payload is a flat list of issues, one per missing field. Each issue
    // locates the field by sheet and row; the frontend maps the field to copy.
    const issuesFor = (sheet, rowId, fields) =>
      fields.map((field) => ({ sheet, rowId, field }))

    it('creates the report when the flag is off despite incomplete in-period data', async () => {
      const { post } = await createServer(exporterRegistration, {
        rows: [
          regOnlyRow('row-1', WASTE_RECORD_TYPE.RECEIVED, {
            MONTH_RECEIVED_FOR_EXPORT: '2026-01',
            TONNAGE_RECEIVED_FOR_EXPORT: 5
          })
        ]
      })

      const response = await post()

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })

    it('creates the report when the flag is on but no completeness rule is triggered', async () => {
      const { post } = await createServer(exporterRegistration, {
        reportDataValidationEnabled: true
      })

      const response = await post()

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })

    it('creates the report when a triggered row has every mandatory field filled', async () => {
      // The supplier rule fires (received tonnage > 0) but the row is complete,
      // so the gate finds nothing missing and creation proceeds.
      const { post } = await createServer(exporterRegistration, {
        reportDataValidationEnabled: true,
        rows: [
          regOnlyRow('row-1', WASTE_RECORD_TYPE.RECEIVED, {
            MONTH_RECEIVED_FOR_EXPORT: '2026-01',
            TONNAGE_RECEIVED_FOR_EXPORT: 5,
            SUPPLIER_NAME: 'Acme Waste Ltd',
            SUPPLIER_ADDRESS: '1 Depot Road',
            SUPPLIER_POSTCODE: 'AB1 2CD',
            SUPPLIER_EMAIL: 'ops@acme.example',
            SUPPLIER_PHONE_NUMBER: '01234 567890',
            ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baling'
          })
        ]
      })

      const response = await post()

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })

    it('blocks the report on an incomplete triggered row from outside the report period', async () => {
      // Whole-summary-log scoping (PAE-1420 pivot): export tonnage with a
      // September export date and a blank OSR_ID. The July report does not
      // aggregate this row, but its incompleteness still blocks report creation.
      const { post } = await createServer(exporterRegistration, {
        accredited: true,
        reportDataValidationEnabled: true,
        rows: [
          accreditedRow({
            DATE_OF_EXPORT: '2026-09-15',
            TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3
          })
        ]
      })

      const response = await post()

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const payload = JSON.parse(response.payload)
      expect(payload.reason).toBe('report_data_incomplete')
      expect(payload.total).toBe(1)
      expect(payload.issues).toEqual(issuesFor('Exported', 'row-1', ['OSR_ID']))
    })

    it('blocks when export tonnage is present but the export date is blank (AC4)', async () => {
      // AC4: a positive export tonnage requires an export date. The OSR_ID is
      // present so the overseas-site rule is satisfied; only the missing export
      // date fails creation.
      const { post } = await createServer(exporterRegistration, {
        accredited: true,
        reportDataValidationEnabled: true,
        rows: [
          accreditedRow({
            TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3,
            OSR_ID: 'ORS-0001'
          })
        ]
      })

      const response = await post()

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const payload = JSON.parse(response.payload)
      expect(payload.reason).toBe('report_data_incomplete')
      expect(payload.total).toBe(1)
      expect(payload.issues).toEqual(
        issuesFor('Exported', 'row-1', ['DATE_OF_EXPORT'])
      )
    })

    it('accredited: an in-period packed row fires the supplier, export and interim rules together', async () => {
      const { post } = await createServer(exporterRegistration, {
        accredited: true,
        reportDataValidationEnabled: true,
        rows: [
          accreditedRow({
            DATE_RECEIVED_FOR_EXPORT: '2026-07-10',
            DATE_OF_EXPORT: '2026-07-20',
            TONNAGE_RECEIVED_FOR_EXPORT: 5,
            TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3,
            DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'Yes'
          })
        ]
      })

      const response = await post()

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const payload = JSON.parse(response.payload)
      expect(payload.reason).toBe('report_data_incomplete')
      expect(payload.total).toBe(SUPPLIER_FIELDS.length + 2)
      expect(payload.issues).toEqual(
        issuesFor('Exported', 'row-1', [
          ...SUPPLIER_FIELDS,
          'OSR_ID',
          'INTERIM_SITE_ID'
        ])
      )
    })

    it('does not gate the report-detail retrieval path (GET) with the flag on', async () => {
      // The gate lives only in report creation: retrieval must still return the
      // on-the-fly report even when the same in-period data would block a POST.
      const { get } = await createServer(exporterRegistration, {
        accredited: true,
        reportDataValidationEnabled: true,
        rows: [
          accreditedRow({
            DATE_RECEIVED_FOR_EXPORT: '2026-07-10',
            DATE_OF_EXPORT: '2026-07-20',
            TONNAGE_RECEIVED_FOR_EXPORT: 5,
            TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3
          })
        ]
      })

      const response = await get()

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload).reason).toBeUndefined()
    })

    it('registered-only: fires the applicable rule on each split row', async () => {
      const { post } = await createServer(exporterRegistration, {
        reportDataValidationEnabled: true,
        rows: [
          regOnlyRow('row-1', WASTE_RECORD_TYPE.RECEIVED, {
            MONTH_RECEIVED_FOR_EXPORT: '2026-01',
            TONNAGE_RECEIVED_FOR_EXPORT: 5
          }),
          regOnlyRow('row-2', WASTE_RECORD_TYPE.EXPORTED, {
            DATE_OF_EXPORT: '2026-02-10',
            TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3
          })
        ]
      })

      const response = await post()

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const payload = JSON.parse(response.payload)
      expect(payload.total).toBe(SUPPLIER_FIELDS.length + 1)
      expect(payload.issues).toEqual([
        ...issuesFor('Received (section 1)', 'row-1', SUPPLIER_FIELDS),
        ...issuesFor('Exported (sections 2 and 3)', 'row-2', ['OSR_ID'])
      ])
    })

    it('caps the reported issues at the maximum while reporting the true total', async () => {
      // A pathological summary log can breach the display cap: the payload stays
      // bounded but `total` still tells the frontend the real number of issues.
      // Each row carries a filled OSR_ID but a blank export date, so it
      // contributes exactly one issue and the total equals the row count.
      const issueCount = MAX_ISSUES_REPORTED + 1
      const rows = Array.from({ length: issueCount }, (_, index) =>
        regOnlyRow(`row-${index + 1}`, WASTE_RECORD_TYPE.EXPORTED, {
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3,
          OSR_ID: 'ORS-0001'
        })
      )

      const { post } = await createServer(exporterRegistration, {
        reportDataValidationEnabled: true,
        rows
      })

      const response = await post()

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const payload = JSON.parse(response.payload)
      expect(payload.total).toBe(issueCount)
      expect(payload.issues).toHaveLength(MAX_ISSUES_REPORTED)
    })

    it('treats a registered-only final-destination dropdown placeholder as unfilled when sent-on tonnage > 0', async () => {
      // The facility type is a 'Choose option' dropdown on the shared exporter
      // Sent-on sheet, so registered-only must flag an unselected one exactly as
      // the accredited schema does (defra-h9hv).
      const { post } = await createServer(exporterRegistration, {
        reportDataValidationEnabled: true,
        rows: [
          regOnlyRow('row-1', WASTE_RECORD_TYPE.SENT_ON, {
            DATE_LOAD_LEFT_SITE: '2026-03-01',
            TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 2,
            FINAL_DESTINATION_NAME: 'Port Recyclers',
            FINAL_DESTINATION_FACILITY_TYPE: 'Choose option',
            FINAL_DESTINATION_ADDRESS: '2 Quay Street',
            FINAL_DESTINATION_POSTCODE: 'EF3 4GH'
          })
        ]
      })

      const response = await post()

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const payload = JSON.parse(response.payload)
      expect(payload.total).toBe(1)
      expect(payload.issues).toEqual([
        expect.objectContaining({
          rowId: 'row-1',
          field: 'FINAL_DESTINATION_FACILITY_TYPE'
        })
      ])
    })
  })

  describe('reprocessor report data completeness gate (PAE-1280)', () => {
    // AC1: the six supplier fields a positive received-for-recycling tonnage
    // makes mandatory. Listed in the policy's declaration order so the expected
    // issues below read naturally; the frontend does not depend on field order.
    const SUPPLIER_FIELDS = [
      'SUPPLIER_NAME',
      'SUPPLIER_ADDRESS',
      'SUPPLIER_POSTCODE',
      'SUPPLIER_EMAIL',
      'SUPPLIER_PHONE_NUMBER',
      'ACTIVITIES_CARRIED_OUT_BY_SUPPLIER'
    ]

    // AC2: the four final-destination fields a positive sent-on tonnage makes
    // mandatory. Listed in the policy's declaration order for readability; the
    // frontend does not depend on field order.
    const DESTINATION_FIELDS = [
      'FINAL_DESTINATION_NAME',
      'FINAL_DESTINATION_FACILITY_TYPE',
      'FINAL_DESTINATION_ADDRESS',
      'FINAL_DESTINATION_POSTCODE'
    ]

    // Row states carry the canonical field names ingestion normalises every
    // reprocessor template to; the gate reads only this data, never the template.
    const reprocessorRow = (processingType, rowId, wasteRecordType, data) =>
      buildSummaryLogRowStateEntry({
        rowId,
        wasteRecordType,
        processingType,
        data
      })

    // The payload is a flat list of issues, one per missing field. Each issue
    // locates the field by sheet and row; the frontend maps the field to copy.
    const issuesFor = (sheet, rowId, fields) =>
      fields.map((field) => ({ sheet, rowId, field }))

    // The three reprocessor templates share the same two rules but differ in
    // registration shape and cadence: input and output are accredited (monthly),
    // registered-only is quarterly. sheetNames are 'Received' and 'Sent on'
    // across all three.
    const TEMPLATES = [
      {
        name: 'accredited on input',
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
        accredited: true
      },
      {
        name: 'accredited on output',
        processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT,
        accredited: true
      },
      {
        name: 'registered-only',
        processingType: PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
        accredited: false
      }
    ]

    describe.each(TEMPLATES)('$name', ({ processingType, accredited }) => {
      it('blocks report creation when a received row is missing supplier details (AC1)', async () => {
        const { post } = await createServer(registeredOnlyReprocessor, {
          accredited,
          reportDataValidationEnabled: true,
          rows: [
            reprocessorRow(
              processingType,
              'row-1',
              WASTE_RECORD_TYPE.RECEIVED,
              {
                TONNAGE_RECEIVED_FOR_RECYCLING: 5
              }
            )
          ]
        })

        const response = await post()

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        const payload = JSON.parse(response.payload)
        expect(payload.reason).toBe('report_data_incomplete')
        expect(payload.total).toBe(SUPPLIER_FIELDS.length)
        expect(payload.issues).toEqual(
          issuesFor('Received', 'row-1', SUPPLIER_FIELDS)
        )
      })

      it('blocks report creation when a sent-on row is missing the final destination (AC2)', async () => {
        const { post } = await createServer(registeredOnlyReprocessor, {
          accredited,
          reportDataValidationEnabled: true,
          rows: [
            reprocessorRow(processingType, 'row-1', WASTE_RECORD_TYPE.SENT_ON, {
              TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 2
            })
          ]
        })

        const response = await post()

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        const payload = JSON.parse(response.payload)
        expect(payload.reason).toBe('report_data_incomplete')
        expect(payload.total).toBe(DESTINATION_FIELDS.length)
        expect(payload.issues).toEqual(
          issuesFor('Sent on', 'row-1', DESTINATION_FIELDS)
        )
      })

      it('creates the report when every triggered row is complete', async () => {
        const { post } = await createServer(registeredOnlyReprocessor, {
          accredited,
          reportDataValidationEnabled: true,
          rows: [
            reprocessorRow(
              processingType,
              'row-1',
              WASTE_RECORD_TYPE.RECEIVED,
              {
                TONNAGE_RECEIVED_FOR_RECYCLING: 5,
                SUPPLIER_NAME: 'Acme Waste Ltd',
                SUPPLIER_ADDRESS: '1 Depot Road',
                SUPPLIER_POSTCODE: 'AB1 2CD',
                SUPPLIER_EMAIL: 'ops@acme.example',
                SUPPLIER_PHONE_NUMBER: '01234 567890',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baling'
              }
            ),
            reprocessorRow(processingType, 'row-2', WASTE_RECORD_TYPE.SENT_ON, {
              TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 2,
              FINAL_DESTINATION_NAME: 'Port Recyclers',
              FINAL_DESTINATION_FACILITY_TYPE: 'Reprocessor',
              FINAL_DESTINATION_ADDRESS: '2 Quay Street',
              FINAL_DESTINATION_POSTCODE: 'EF3 4GH'
            })
          ]
        })

        const response = await post()

        expect(response.statusCode).toBe(StatusCodes.CREATED)
      })
    })

    it('does not gate a record type that carries no completeness rule', async () => {
      // The reprocessed-loads (processed) record type has no report-mandatory
      // rule, so the gate skips it: a processing type with a policy still leaves
      // unruled record types untouched.
      const { post } = await createServer(registeredOnlyReprocessor, {
        accredited: true,
        reportDataValidationEnabled: true,
        rows: [
          reprocessorRow(
            PROCESSING_TYPES.REPROCESSOR_INPUT,
            'row-1',
            WASTE_RECORD_TYPE.PROCESSED,
            { PRODUCT_TONNAGE: 5 }
          )
        ]
      })

      const response = await post()

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })

    it('blocks a registered-only placeholder facility type but never gates the GET retrieval path (defra-h9hv twin)', async () => {
      // The facility type is a 'Choose option' dropdown on the reprocessor
      // registered-only Sent-on sheet, so an unselected one must be flagged
      // exactly as the accredited schemas do. The same incomplete data must
      // still return the on-the-fly report on GET: the gate lives only in
      // report creation.
      const { post, get } = await createServer(registeredOnlyReprocessor, {
        reportDataValidationEnabled: true,
        rows: [
          reprocessorRow(
            PROCESSING_TYPES.REPROCESSOR_REGISTERED_ONLY,
            'row-1',
            WASTE_RECORD_TYPE.SENT_ON,
            {
              DATE_LOAD_LEFT_SITE: '2026-03-01',
              TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 2,
              FINAL_DESTINATION_NAME: 'Port Recyclers',
              FINAL_DESTINATION_FACILITY_TYPE: 'Choose option',
              FINAL_DESTINATION_ADDRESS: '2 Quay Street',
              FINAL_DESTINATION_POSTCODE: 'EF3 4GH'
            }
          )
        ]
      })

      const response = await post()

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      const payload = JSON.parse(response.payload)
      expect(payload.total).toBe(1)
      expect(payload.issues).toEqual([
        expect.objectContaining({
          rowId: 'row-1',
          field: 'FINAL_DESTINATION_FACILITY_TYPE'
        })
      ])

      const getResponse = await get()

      expect(getResponse.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(getResponse.payload).reason).toBeUndefined()
    })
  })
})

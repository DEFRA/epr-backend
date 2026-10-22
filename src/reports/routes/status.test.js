import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { partialMock } from '#test/type-helpers.js'
import { asOperator } from '#test/inject-auth.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'
import { REPORT_STATUS_SLOT } from '#reports/domain/report-status.js'
import {
  accreditation,
  granted,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import * as reportAudit from '#reports/application/audit.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import { AccreditationStatus } from '#domain/organisations/model.js' */

vi.mock('#reports/application/audit.js', () => ({
  auditReportStatusTransition: vi.fn().mockResolvedValue(undefined)
}))

const YEAR = 2026

// Populated enough for any operator category to pass the completeness check.
const COMPLETE_MANUAL_FIELDS = {
  recyclingActivity: {
    suppliers: [],
    totalTonnageReceived: 0,
    tonnageRecycled: 100,
    tonnageNotRecycled: 10
  },
  exportActivity: {
    overseasSites: [],
    unapprovedOverseasSites: [],
    totalTonnageExported: 0,
    tonnageReceivedNotExported: 0,
    tonnageRefusedAtDestination: 0,
    tonnageStoppedDuringExport: 0,
    totalTonnageRefusedOrStopped: 0,
    tonnageRepatriated: 0
  },
  prn: {
    issuedTonnage: 100,
    totalRevenue: 1000,
    freeTonnage: 0,
    averagePricePerTonne: 10
  }
}

const INCOMPLETE_PRN = {
  prn: {
    issuedTonnage: 100,
    totalRevenue: null,
    freeTonnage: 0,
    averagePricePerTonne: null
  }
}

const REGISTERED_ONLY = { cadence: 'quarterly', period: 1 }
const ACCREDITED = { cadence: 'monthly', period: 7 }

describe('POST /organisations/{organisationNumber}/registrations/{registrationNumber}/.../submissions/{submissionNumber}/status', () => {
  setupAuthContext()

  /**
   * @param {{
   *   reportOverrides?: object,
   *   accreditationStatus?: AccreditationStatus,
   *   stream?: { cadence: string, period: number },
   *   withReport?: boolean
   * }} [options]
   */
  const createServer = async ({
    reportOverrides = {},
    accreditationStatus,
    stream = accreditationStatus ? ACCREDITED : REGISTERED_ONLY,
    withReport = true
  } = {}) => {
    const accredited = accreditationStatus
      ? accreditation({ statusHistory: granted(accreditationStatus) })
      : undefined
    const registration = reprocessor(
      accredited ? { accreditationId: accredited.id } : {}
    )
    const org = buildOrganisation({
      registrations: [registration],
      accreditations: accredited ? [accredited] : []
    })
    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const reportsRepository = reportsRepositoryFactory()

    const createdReport = withReport
      ? await reportsRepository.createReport(
          buildCreateReportParams({
            organisationId: org.id,
            registrationId: registration.id,
            year: YEAR,
            ...stream,
            ...COMPLETE_MANUAL_FIELDS,
            ...reportOverrides
          })
        )
      : undefined

    const server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(org)
        ]),
        reportsRepository: reportsRepositoryFactory
      }
    })

    const registrationUrl = `/organisations/${org.orgId}/registrations/${registration.registrationNumber}`
    const reports =
      stream === ACCREDITED
        ? `${registrationUrl}/accreditations/${YEAR}/reports/monthly`
        : `${registrationUrl}/reports/${YEAR}/quarterly`
    const url = `${reports}/${stream.period}/submissions/1/status`

    return {
      server,
      organisationId: org.id,
      registrationId: registration.id,
      reportId: /** @type {string} */ (createdReport?.id),
      reportsRepository,
      url,
      registrationUrl,
      /** @param {object} payload */
      postStatus: (payload) =>
        server.inject({
          method: 'POST',
          url,
          payload,
          ...asOperator()
        })
    }
  }

  it('refuses a regulator standard user, who reads but never writes', async () => {
    const { server, url } = await createServer()

    const response = await server.inject({
      method: 'POST',
      url,
      payload: { status: 'ready_to_submit', version: 1 },
      headers: {
        Authorization: `Bearer ${entraIdMockAuthTokens.regulatorToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
  })

  describe('successful transitions', () => {
    it('advances status to ready_to_submit', async () => {
      const { postStatus } = await createServer()

      const response = await postStatus({
        status: 'ready_to_submit',
        version: 1
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toMatchObject({
        status: 'ready_to_submit'
      })
    })

    it('advances status to submitted with submissionDeclaredBy stored', async () => {
      const { postStatus, reportsRepository, reportId } = await createServer()

      await reportsRepository.updateReportStatus({
        reportId,
        version: 1,
        status: 'ready_to_submit',
        slot: REPORT_STATUS_SLOT.READY,
        changedBy: { id: 'test', name: 'Test', position: 'Officer' }
      })

      const response = await postStatus({
        status: 'submitted',
        version: 2,
        submissionDeclaredBy: 'Jane Smith'
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toMatchObject({
        status: 'submitted'
      })

      const updatedReport = await reportsRepository.findReportById(reportId)
      expect(updatedReport.status.submitted?.declaredBy).toBe('Jane Smith')
    })
  })

  describe('auditing', () => {
    beforeEach(() => vi.clearAllMocks())

    it('calls auditReportStatusTransition with correct params on successful transition', async () => {
      const { postStatus, organisationId, registrationId, reportId } =
        await createServer()

      await postStatus({ status: 'ready_to_submit', version: 1 })

      expect(reportAudit.auditReportStatusTransition).toHaveBeenCalledWith(
        expect.any(Object),
        {
          organisationId,
          registrationId,
          year: YEAR,
          cadence: 'quarterly',
          period: 1,
          submissionNumber: expect.anything(),
          reportId,
          previous: expect.objectContaining({
            id: reportId,
            version: 1,
            status: expect.objectContaining({ currentStatus: 'in_progress' })
          }),
          next: expect.objectContaining({
            id: reportId,
            version: 2,
            status: expect.objectContaining({
              currentStatus: 'ready_to_submit'
            })
          })
        }
      )
    })
  })

  describe('optimistic locking', () => {
    it('returns 409 when version does not match', async () => {
      const { postStatus } = await createServer()

      const response = await postStatus({
        status: 'ready_to_submit',
        version: 99
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })
  })

  describe('completeness guard', () => {
    it('returns 400 with structured missingFields when tonnageRecycled is null for a registered-only reprocessor', async () => {
      const { postStatus } = await createServer({
        reportOverrides: {
          recyclingActivity: {
            suppliers: [],
            totalTonnageReceived: 0,
            tonnageRecycled: null,
            tonnageNotRecycled: 10
          }
        }
      })

      const response = await postStatus({
        status: 'ready_to_submit',
        version: 1
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      expect(JSON.parse(response.payload)).toEqual({
        statusCode: StatusCodes.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Report is incomplete; 1 required field(s) not populated',
        missingFields: ['recyclingActivity.tonnageRecycled']
      })
    })

    it('returns 400 with structured missingFields when prn.totalRevenue is null for an accredited reprocessor', async () => {
      const { postStatus } = await createServer({
        reportOverrides: INCOMPLETE_PRN,
        accreditationStatus: 'approved'
      })

      const response = await postStatus({
        status: 'ready_to_submit',
        version: 1
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      expect(JSON.parse(response.payload)).toEqual({
        statusCode: StatusCodes.BAD_REQUEST,
        error: 'Bad Request',
        message: 'Report is incomplete; 1 required field(s) not populated',
        missingFields: ['prn.totalRevenue']
      })
    })

    it('report incomplete attaches REPORT_INCOMPLETE code and missingFields in event.reason', async () => {
      const { server, postStatus, reportId } = await createServer({
        reportOverrides: {
          recyclingActivity: {
            suppliers: [],
            totalTonnageReceived: 0,
            tonnageRecycled: null,
            tonnageNotRecycled: null
          }
        }
      })

      await postStatus({ status: 'ready_to_submit', version: 1 })

      expect(server.loggerMocks.warn).toHaveBeenCalledWith({
        message: 'Report is incomplete; 2 required field(s) not populated',
        error: {
          code: 'report_incomplete',
          id: expect.any(String),
          message: 'Report is incomplete; 2 required field(s) not populated',
          stack_trace: expect.any(String),
          type: 'Bad Request'
        },
        event: {
          category: 'http',
          action: 'update_report_status',
          kind: 'event',
          outcome: 'failure',
          reason:
            'missingCount=2 missingFields=[recyclingActivity.tonnageRecycled,recyclingActivity.tonnageNotRecycled]',
          reference: reportId
        },
        http: { response: { status_code: 400 } }
      })
    })

    it.each(
      /** @type {AccreditationStatus[]} */ ([
        'created',
        'rejected',
        'cancelled',
        'approved'
      ])
    )(
      'allows a registered-only report for a reprocessor with a %s accreditation without prn fields',
      async (accreditationStatus) => {
        const { postStatus } = await createServer({
          reportOverrides: INCOMPLETE_PRN,
          accreditationStatus,
          stream: REGISTERED_ONLY
        })

        const response = await postStatus({
          status: 'ready_to_submit',
          version: 1
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
      }
    )

    it('allows transition to ready_to_submit when all required fields for the operator category are populated', async () => {
      const { postStatus } = await createServer()

      const response = await postStatus({
        status: 'ready_to_submit',
        version: 1
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('transition guards', () => {
    it('returns 400 for invalid transition from in_progress to submitted', async () => {
      const { postStatus } = await createServer()

      const response = await postStatus({
        status: 'submitted',
        version: 1,
        submissionDeclaredBy: 'Jane Smith'
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    })

    it('returns 400 when attempting to transition from submitted to any status', async () => {
      const { postStatus, reportsRepository, reportId } = await createServer()

      await reportsRepository.updateReportStatus({
        reportId,
        version: 1,
        status: 'ready_to_submit',
        slot: REPORT_STATUS_SLOT.READY,
        changedBy: { id: 'test', name: 'Test', position: 'Officer' }
      })
      await reportsRepository.updateReportStatus({
        reportId,
        version: 2,
        status: 'submitted',
        slot: REPORT_STATUS_SLOT.SUBMITTED,
        changedBy: { id: 'test', name: 'Test', position: 'Officer' },
        submissionDeclaredBy: 'Test User'
      })

      const response = await postStatus({
        status: 'ready_to_submit',
        version: 3
      })

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
    })
  })

  describe('error handling', () => {
    it('returns 404 when no report exists for period', async () => {
      const { postStatus } = await createServer({ withReport: false })

      const response = await postStatus({
        status: 'ready_to_submit',
        version: 1
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 422 for invalid status value', async () => {
      const { postStatus } = await createServer()

      const response = await postStatus({ status: 'banana', version: 1 })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when version is missing', async () => {
      const { postStatus } = await createServer()

      const response = await postStatus({ status: 'ready_to_submit' })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when payload is empty', async () => {
      const { postStatus } = await createServer({ withReport: false })

      const response = await postStatus({})

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when submissionDeclaredBy is missing for submitted status', async () => {
      const { postStatus } = await createServer()

      const response = await postStatus({ status: 'submitted', version: 1 })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when submissionDeclaredBy is a single character', async () => {
      const { postStatus } = await createServer()

      const response = await postStatus({
        status: 'submitted',
        version: 1,
        submissionDeclaredBy: 'A'
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 when submissionDeclaredBy exceeds 255 characters', async () => {
      const { postStatus } = await createServer()

      const response = await postStatus({
        status: 'submitted',
        version: 1,
        submissionDeclaredBy: 'A'.repeat(256)
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it.each(['@', '#', '$', '%', '&', '<', '>'])(
      'returns 422 when submissionDeclaredBy contains invalid character %s',
      async (char) => {
        const { postStatus } = await createServer()

        const response = await postStatus({
          status: 'submitted',
          version: 1,
          submissionDeclaredBy: `Jane ${char} Smith`
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      }
    )

    it('returns 422 when submissionDeclaredBy is provided for non-submitted transition', async () => {
      const { postStatus } = await createServer()

      const response = await postStatus({
        status: 'ready_to_submit',
        version: 1,
        submissionDeclaredBy: 'Jane Smith'
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 for invalid cadence', async () => {
      const { server, registrationUrl } = await createServer({
        withReport: false
      })

      const response = await server.inject({
        method: 'POST',
        url: `${registrationUrl}/reports/${YEAR}/biweekly/1/submissions/1/status`,
        payload: { status: 'ready_to_submit', version: 1 },
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('when report is stale', () => {
    it('returns 409 with summary_log_changed code', async () => {
      const { postStatus, reportsRepository, organisationId, registrationId } =
        await createServer()

      await reportsRepository.markActiveReportsStaleForSummaryLog(
        organisationId,
        registrationId,
        'sl-new',
        new Date().toISOString()
      )

      const response = await postStatus({
        status: 'ready_to_submit',
        version: 2
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(response.payload).code).toEqual(['summary_log_changed'])
    })
  })
})

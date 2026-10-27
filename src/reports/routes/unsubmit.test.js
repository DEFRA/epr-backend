import { toYear } from '#common/helpers/dates/year.js'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { partialMock } from '#test/type-helpers.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  buildCreateReportParams,
  createAndSubmitReport,
  DEFAULT_CHANGED_BY
} from '#reports/repository/contract/test-data.js'
import { reprocessor } from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { REPORT_STATUS_SLOT } from '#reports/domain/report-status.js'
import * as reportAudit from '#reports/application/audit.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { ReportStatusHistoryItem, ReportsRepository } from '#reports/repository/port.js' */

vi.mock('#reports/application/audit.js', () => ({
  auditReportStatusTransition: vi.fn().mockResolvedValue(undefined)
}))

const YEAR = toYear(2026)

/**
 * @typedef {{
 *   organisationId: string,
 *   registrationId: string,
 *   year: Year,
 *   cadence: string,
 *   period: number
 * }} Period
 */

describe('POST /organisations/{organisationNumber}/registrations/{registrationNumber}/reports/{year}/{cadence}/{period}/submissions/{submissionNumber}/unsubmit', () => {
  setupAuthContext()

  /**
   * @param {(reportsRepository: ReportsRepository, period: Period) => Promise<unknown>} seed
   */
  const createServer = async (seed) => {
    const registration = reprocessor()
    const org = buildOrganisation({ registrations: [registration] })

    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const reportsRepository = reportsRepositoryFactory()

    const reportId = await seed(reportsRepository, {
      organisationId: org.id,
      registrationId: registration.id,
      year: YEAR,
      cadence: 'quarterly',
      period: 1
    })

    const server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(org)
        ]),
        reportsRepository: reportsRepositoryFactory
      }
    })

    return {
      server,
      organisationId: org.id,
      registrationId: registration.id,
      reportId: /** @type {string} */ (reportId),
      reportsRepository,
      /** @param {number} [submissionNumber] */
      urlFor: (submissionNumber = 1) =>
        `/organisations/${org.orgId}/registrations/${registration.registrationNumber}/reports/${YEAR}/quarterly/1/submissions/${submissionNumber}/unsubmit`
    }
  }

  const createServerWithSubmittedReport = () =>
    createServer((reportsRepository, period) =>
      createAndSubmitReport(reportsRepository, period)
    )

  // Submission 1 has been superseded by a later submitted resubmission
  // (submission 2, the current one). Reproduces the PAE-1657 finding.
  const createServerWithTwoSubmittedSubmissions = () =>
    createServer(async (reportsRepository, period) => {
      const supersededReportId = await createAndSubmitReport(
        reportsRepository,
        { ...period, submissionNumber: 1 }
      )
      await createAndSubmitReport(reportsRepository, {
        ...period,
        submissionNumber: 2
      })
      return supersededReportId
    })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('successful unsubmit', () => {
    it('returns 200 with the report back in ready_to_submit', async () => {
      const { server, urlFor } = await createServerWithSubmittedReport()

      const response = await server.inject({
        method: 'POST',
        url: urlFor(),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toMatchObject({
        status: 'ready_to_submit'
      })
    })

    it('preserves status.created, status.ready and status.submitted; sets status.unsubmitted', async () => {
      const { server, urlFor, reportsRepository, reportId } =
        await createServerWithSubmittedReport()

      await server.inject({
        method: 'POST',
        url: urlFor(),
        ...asServiceMaintainer()
      })

      const updated = await reportsRepository.findReportById(reportId)
      expect(updated.status.currentStatus).toBe('ready_to_submit')
      expect(updated.status[REPORT_STATUS_SLOT.CREATED]).toBeDefined()
      expect(updated.status[REPORT_STATUS_SLOT.READY]).toBeDefined()
      expect(updated.status[REPORT_STATUS_SLOT.SUBMITTED]).toBeDefined()
      expect(updated.status[REPORT_STATUS_SLOT.UNSUBMITTED]).toMatchObject({
        at: expect.any(String),
        by: expect.objectContaining({
          id: 'test-maintainer-id',
          position: 'Service Maintainer'
        })
      })
    })

    it('appends ready_to_submit to status.history', async () => {
      const { server, urlFor, reportsRepository, reportId } =
        await createServerWithSubmittedReport()

      await server.inject({
        method: 'POST',
        url: urlFor(),
        ...asServiceMaintainer()
      })

      const updated = await reportsRepository.findReportById(reportId)

      const lastEntry = /** @type {ReportStatusHistoryItem} */ (
        updated.status.history.at(-1)
      )
      expect(lastEntry.status).toBe('ready_to_submit')
    })

    it('calls auditReportStatusTransition with correct params', async () => {
      const { server, urlFor, organisationId, registrationId, reportId } =
        await createServerWithSubmittedReport()

      await server.inject({
        method: 'POST',
        url: urlFor(),
        ...asServiceMaintainer()
      })

      expect(reportAudit.auditReportStatusTransition).toHaveBeenCalledWith(
        expect.any(Object),
        {
          organisationId,
          registrationId,
          year: YEAR,
          cadence: 'quarterly',
          period: 1,
          submissionNumber: 1,
          reportId,
          previous: expect.objectContaining({
            status: expect.objectContaining({ currentStatus: 'submitted' })
          }),
          next: expect.objectContaining({
            status: expect.objectContaining({
              currentStatus: 'ready_to_submit'
            })
          })
        }
      )
    })
  })

  describe('authorisation', () => {
    it('returns 401 for an unauthenticated request', async () => {
      const { server, urlFor } = await createServerWithSubmittedReport()

      const response = await server.inject({ method: 'POST', url: urlFor() })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 for an operator', async () => {
      const { server, urlFor } = await createServerWithSubmittedReport()

      const response = await server.inject({
        method: 'POST',
        url: urlFor(),
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })

  describe('error handling', () => {
    it('returns 404 when no report exists for the period', async () => {
      const { server, urlFor } = await createServer(async () => undefined)

      const response = await server.inject({
        method: 'POST',
        url: urlFor(),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 409 when report is in_progress', async () => {
      const { server, urlFor } = await createServer(
        (reportsRepository, period) =>
          reportsRepository.createReport(buildCreateReportParams(period))
      )

      const response = await server.inject({
        method: 'POST',
        url: urlFor(),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })

    it('returns 409 when report is ready_to_submit', async () => {
      const { server, urlFor } = await createServer(
        async (reportsRepository, period) => {
          const report = await reportsRepository.createReport(
            buildCreateReportParams(period)
          )
          await reportsRepository.updateReportStatus({
            reportId: report.id,
            version: 1,
            status: 'ready_to_submit',
            slot: REPORT_STATUS_SLOT.READY,
            changedBy: DEFAULT_CHANGED_BY
          })
        }
      )

      const response = await server.inject({
        method: 'POST',
        url: urlFor(),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })

    it('returns 409 when report is marked as requiring resubmission', async () => {
      const { server, urlFor } = await createServer(
        async (reportsRepository, period) => {
          await createAndSubmitReport(reportsRepository, period)
          await reportsRepository.markSubmittedReportRequiringResubmissionByOperator(
            {
              ...period,
              submissionNumber: 1,
              requestedBy: DEFAULT_CHANGED_BY,
              requestedAt: new Date().toISOString()
            }
          )
        }
      )

      const response = await server.inject({
        method: 'POST',
        url: urlFor(),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })
  })

  describe('superseded submission', () => {
    it('returns 409 when unsubmitting a submission superseded by a later one', async () => {
      const { server, urlFor } = await createServerWithTwoSubmittedSubmissions()

      const response = await server.inject({
        method: 'POST',
        url: urlFor(1),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })

    it('leaves the superseded submission submitted after a rejected unsubmit', async () => {
      const { server, urlFor, reportId, reportsRepository } =
        await createServerWithTwoSubmittedSubmissions()

      await server.inject({
        method: 'POST',
        url: urlFor(1),
        ...asServiceMaintainer()
      })

      const report = await reportsRepository.findReportById(reportId)
      expect(report.status.currentStatus).toBe('submitted')
    })

    it('allows unsubmitting the latest submitted submission', async () => {
      const { server, urlFor } = await createServerWithTwoSubmittedSubmissions()

      const response = await server.inject({
        method: 'POST',
        url: urlFor(2),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns 409 when unsubmitting a submitted submission while a later resubmission draft is in progress', async () => {
      // Submission 1 is the latest *submitted* one, but a later draft exists:
      // only the absolute latest submission may be unsubmitted.
      const { server, urlFor } = await createServer(
        async (reportsRepository, period) => {
          await createAndSubmitReport(reportsRepository, {
            ...period,
            submissionNumber: 1
          })
          await reportsRepository.createReport(
            buildCreateReportParams({ ...period, submissionNumber: 2 })
          )
        }
      )

      const response = await server.inject({
        method: 'POST',
        url: urlFor(1),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })
  })
})

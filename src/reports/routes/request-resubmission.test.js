import { toYear } from '#common/helpers/dates/year.js'
import { organisationReadRepositoryOf } from '#vite/helpers/organisation-read-model.js'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { partialMock } from '#test/type-helpers.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  buildCreateReportParams,
  createAndSubmitReport,
  reportKeyOf
} from '#reports/repository/contract/test-data.js'
import { reprocessor } from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import * as reportAudit from '#reports/application/audit.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { ReportsRepository } from '#reports/repository/port.js' */

vi.mock('#reports/application/audit.js', () => ({
  auditReportRequestResubmission: vi.fn().mockResolvedValue(undefined)
}))

const YEAR = toYear(2026)

/**
 * @typedef {{
 *   organisationNumber: OrganisationNumber,
 *   registrationNumber: RegistrationNumber,
 *   year: Year,
 *   cadence: 'quarterly',
 *   period: number
 * }} Period
 */

describe('POST /organisations/{organisationNumber}/registrations/{registrationNumber}/reports/{year}/{cadence}/{period}/submissions/{submissionNumber}/request-resubmission', () => {
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
      ...reportKeyOf(org, registration),
      year: YEAR,
      cadence: 'quarterly',
      period: 1
    })

    const server = await createTestServer({
      repositories: {
        organisationReadRepository: await organisationReadRepositoryOf([
          partialMock(org)
        ]),
        reportsRepository: reportsRepositoryFactory
      }
    })

    return {
      server,
      ...reportKeyOf(org, registration),
      reportId,
      reportsRepository,
      url: `/organisations/${org.organisationNumber}/registrations/${registration.registrationNumber}/reports/${YEAR}/quarterly/1/submissions/1/request-resubmission`
    }
  }

  const createServerWithSubmittedReport = () =>
    createServer((reportsRepository, period) =>
      createAndSubmitReport(reportsRepository, period)
    )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('successful request', () => {
    it('returns 200 with the report still submitted and its resubmission requested', async () => {
      const { server, url } = await createServerWithSubmittedReport()

      const response = await server.inject({
        method: 'POST',
        url,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload)).toMatchObject({
        status: 'submitted',
        resubmissionRequired: { operatorRequested: expect.any(Object) }
      })
    })

    it('sets resubmissionRequired.operatorRequested on the report', async () => {
      const { server, url, reportsRepository, reportId } =
        await createServerWithSubmittedReport()

      await server.inject({ method: 'POST', url, ...asOperator() })

      const updated = await reportsRepository.findReportById(
        /** @type {string} */ (reportId)
      )
      expect(updated.resubmissionRequired?.operatorRequested).toMatchObject({
        requestedAt: expect.any(String),
        requestedBy: expect.objectContaining({ id: 'test-user-id' })
      })
    })

    it('calls auditReportRequestResubmission with correct params', async () => {
      const { server, url, organisationNumber, registrationNumber, reportId } =
        await createServerWithSubmittedReport()

      await server.inject({ method: 'POST', url, ...asOperator() })

      expect(reportAudit.auditReportRequestResubmission).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          organisationNumber,
          registrationNumber,
          year: YEAR,
          cadence: 'quarterly',
          period: 1,
          submissionNumber: 1,
          reportId,
          resubmissionRequired: expect.objectContaining({
            operatorRequested: expect.any(Object)
          })
        })
      )
    })

    it('returns 409 on a second call — already requested', async () => {
      const { server, url } = await createServerWithSubmittedReport()

      await server.inject({ method: 'POST', url, ...asOperator() })
      const second = await server.inject({
        method: 'POST',
        url,
        ...asOperator()
      })

      expect(second.statusCode).toBe(StatusCodes.CONFLICT)
      expect(JSON.parse(second.payload).reason).toBe(
        'resubmission_already_requested'
      )
    })
  })

  describe('authorisation', () => {
    it('returns 401 for an unauthenticated request', async () => {
      const { server, url } = await createServerWithSubmittedReport()

      const response = await server.inject({ method: 'POST', url })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 for a service maintainer (organisationWrite is operator-only, unlike unsubmit)', async () => {
      const { server, url } = await createServerWithSubmittedReport()

      const response = await server.inject({
        method: 'POST',
        url,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })
  })

  describe('error handling', () => {
    it('returns 404 when no report exists for the period', async () => {
      const { server, url } = await createServer(async () => undefined)

      const response = await server.inject({
        method: 'POST',
        url,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 409 when report is in_progress', async () => {
      const { server, url } = await createServer((reportsRepository, period) =>
        reportsRepository.createReport(buildCreateReportParams(period))
      )

      const response = await server.inject({
        method: 'POST',
        url,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })

    it('returns 409 when a later submission already exists for the period', async () => {
      const { server, url } = await createServer(
        async (reportsRepository, period) => {
          await createAndSubmitReport(reportsRepository, {
            ...period,
            submissionNumber: 1
          })
          await createAndSubmitReport(reportsRepository, {
            ...period,
            submissionNumber: 2
          })
        }
      )

      const response = await server.inject({
        method: 'POST',
        url,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })

    it('returns 409 when a draft above the submission makes it no longer the latest', async () => {
      const { server, url } = await createServer(
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
        url,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })
  })
})

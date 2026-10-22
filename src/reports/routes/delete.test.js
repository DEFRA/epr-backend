import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'
import { REPORT_STATUS_SLOT } from '#reports/domain/report-status.js'
import { reprocessor } from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import * as reportAudit from '#reports/application/audit.js'

const { buildOrganisation } = createOrganisationBuilders()

vi.mock('#reports/application/audit.js', () => ({
  auditReportDelete: vi.fn().mockResolvedValue(undefined)
}))

const YEAR = 2026

describe('DELETE /organisations/{organisationNumber}/registrations/{registrationNumber}/reports/{year}/{cadence}/{period}/submissions/{submissionNumber}', () => {
  setupAuthContext()

  const createServer = async ({ withReport = true } = {}) => {
    const registration = reprocessor()
    const org = buildOrganisation({ registrations: [registration] })

    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const reportsRepository = reportsRepositoryFactory()

    const createdReport = withReport
      ? await reportsRepository.createReport(
          buildCreateReportParams({
            organisationId: org.id,
            registrationId: registration.id,
            year: YEAR,
            cadence: 'quarterly',
            period: 1,
            startDate: '2026-01-01',
            endDate: '2026-03-31',
            dueDate: '2026-04-20'
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

    const reports = `/organisations/${org.orgId}/registrations/${registration.registrationNumber}/reports/${YEAR}`

    return {
      server,
      organisationId: org.id,
      registrationId: registration.id,
      reportId: /** @type {string} */ (createdReport?.id),
      reportsRepository,
      /** @param {string} [cadence] */
      deleteReport: (cadence = 'quarterly') =>
        server.inject({
          method: 'DELETE',
          url: `${reports}/${cadence}/1/submissions/1`,
          ...asOperator()
        })
    }
  }

  describe('successful deletion', () => {
    it('returns 204 and removes report from period slot', async () => {
      const {
        organisationId,
        registrationId,
        reportsRepository,
        deleteReport
      } = await createServer()

      const response = await deleteReport()

      expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)

      const periodicReports = await reportsRepository.findPeriodicReports({
        organisationId,
        registrationId
      })
      expect(periodicReports).toEqual([])
    })

    it('returns 204 when report is ready_to_submit', async () => {
      const { reportsRepository, reportId, deleteReport } = await createServer()

      await reportsRepository.updateReportStatus({
        reportId,
        version: 1,
        status: 'ready_to_submit',
        slot: REPORT_STATUS_SLOT.READY,
        changedBy: { id: 'test', name: 'Test', position: 'Officer' }
      })

      const response = await deleteReport()

      expect(response.statusCode).toBe(StatusCodes.NO_CONTENT)
    })
  })

  describe('auditing', () => {
    beforeEach(() => vi.clearAllMocks())

    it('calls auditReportDelete with correct params on successful delete', async () => {
      const { organisationId, registrationId, reportId, deleteReport } =
        await createServer()

      await deleteReport()

      expect(reportAudit.auditReportDelete).toHaveBeenCalledWith(
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
          })
        }
      )
    })
  })

  describe('status guard', () => {
    it('returns 409 when most recent report is submitted', async () => {
      const { reportsRepository, reportId, deleteReport } = await createServer()

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

      const response = await deleteReport()

      expect(response.statusCode).toBe(StatusCodes.CONFLICT)
    })

    it('returns 404 when report was already deleted', async () => {
      const { deleteReport } = await createServer()

      await deleteReport()

      const response = await deleteReport()

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('error handling', () => {
    it('returns 404 when no report exists for period', async () => {
      const { deleteReport } = await createServer({ withReport: false })

      const response = await deleteReport()

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 422 for invalid cadence', async () => {
      const { deleteReport } = await createServer({ withReport: false })

      const response = await deleteReport('biweekly')

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })
})

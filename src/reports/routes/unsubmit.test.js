import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  buildOrganisationWithRegistration,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import {
  buildCreateReportParams,
  createAndSubmitReport,
  DEFAULT_CHANGED_BY
} from '#reports/repository/contract/test-data.js'
import { reportsUnsubmitPath } from './unsubmit.js'
import * as reportAudit from '#reports/application/audit.js'

vi.mock('#reports/application/audit.js', () => ({
  auditReportStatusTransition: vi.fn().mockResolvedValue(undefined)
}))

describe(`POST ${reportsUnsubmitPath}`, () => {
  setupAuthContext()

  const makeUrl = (
    orgId,
    regId,
    year = 2024,
    cadence = 'monthly',
    period = 1
  ) =>
    `/v1/organisations/${orgId}/registrations/${regId}/reports/${year}/${cadence}/${period}/unsubmit`

  const buildServerWithSubmittedReport = async () => {
    const registration = buildRegistration({
      wasteProcessingType: 'reprocessor',
      accreditationId: undefined
    })
    const org = buildOrganisationWithRegistration(registration)

    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const reportsRepository = reportsRepositoryFactory()

    const reportId = await createAndSubmitReport(reportsRepository, {
      organisationId: org.id,
      registrationId: registration.id,
      year: 2024,
      cadence: 'monthly',
      period: 1
    })

    const server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([org]),
        wasteRecordsRepository: createInMemoryWasteRecordsRepository([]),
        reportsRepository: reportsRepositoryFactory
      },
      featureFlags: createInMemoryFeatureFlags({
        reports: true,
        reportUnsubmit: true
      })
    })

    return {
      server,
      organisationId: org.id,
      registrationId: registration.id,
      reportId,
      reportsRepository
    }
  }

  const buildServerWithReportInStatus = async (targetStatus) => {
    const registration = buildRegistration({
      wasteProcessingType: 'reprocessor',
      accreditationId: undefined
    })
    const org = buildOrganisationWithRegistration(registration)

    const reportsRepositoryFactory = createInMemoryReportsRepository()
    const reportsRepository = reportsRepositoryFactory()

    const report = await reportsRepository.createReport(
      buildCreateReportParams({
        organisationId: org.id,
        registrationId: registration.id
      })
    )

    if (targetStatus === 'ready_to_submit') {
      await reportsRepository.updateReportStatus({
        reportId: report.id,
        version: 1,
        status: 'ready_to_submit',
        changedBy: DEFAULT_CHANGED_BY
      })
    }

    const server = await createTestServer({
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([org]),
        wasteRecordsRepository: createInMemoryWasteRecordsRepository([]),
        reportsRepository: reportsRepositoryFactory
      },
      featureFlags: createInMemoryFeatureFlags({
        reports: true,
        reportUnsubmit: true
      })
    })

    return { server, organisationId: org.id, registrationId: registration.id }
  }

  describe('when feature flag is enabled', () => {
    describe('successful unsubmit', () => {
      beforeEach(() => vi.clearAllMocks())

      it('returns 200 with status ready_to_submit', async () => {
        const { server, organisationId, registrationId } =
          await buildServerWithSubmittedReport()

        const response = await server.inject({
          method: 'POST',
          url: makeUrl(organisationId, registrationId),
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(JSON.parse(response.payload)).toEqual({
          status: 'ready_to_submit'
        })
      })

      it('preserves status.created, status.ready and status.submitted; sets status.unsubmitted', async () => {
        const {
          server,
          organisationId,
          registrationId,
          reportsRepository,
          reportId
        } = await buildServerWithSubmittedReport()

        await server.inject({
          method: 'POST',
          url: makeUrl(organisationId, registrationId),
          ...asServiceMaintainer()
        })

        const updated = await reportsRepository.findReportById(reportId)
        expect(updated.status.currentStatus).toBe('ready_to_submit')
        expect(updated.status.created).toBeDefined()
        expect(updated.status.ready).toBeDefined()
        expect(updated.status.submitted).toBeDefined()
        expect(updated.status.unsubmitted).toMatchObject({
          at: expect.any(String),
          by: expect.objectContaining({ id: 'test-maintainer-id' })
        })
      })

      it('appends ready_to_submit to status.history', async () => {
        const {
          server,
          organisationId,
          registrationId,
          reportsRepository,
          reportId
        } = await buildServerWithSubmittedReport()

        await server.inject({
          method: 'POST',
          url: makeUrl(organisationId, registrationId),
          ...asServiceMaintainer()
        })

        const updated = await reportsRepository.findReportById(reportId)
        const lastEntry = updated.status.history.at(-1)
        expect(lastEntry.status).toBe('ready_to_submit')
      })

      it('calls auditReportStatusTransition with correct params', async () => {
        const { server, organisationId, registrationId, reportId } =
          await buildServerWithSubmittedReport()

        await server.inject({
          method: 'POST',
          url: makeUrl(organisationId, registrationId),
          ...asServiceMaintainer()
        })

        expect(reportAudit.auditReportStatusTransition).toHaveBeenCalledWith(
          expect.any(Object),
          {
            organisationId,
            registrationId,
            year: 2024,
            cadence: 'monthly',
            period: 1,
            submissionNumber: expect.anything(),
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
      it('returns 403 for a standard user', async () => {
        const { server, organisationId, registrationId } =
          await buildServerWithSubmittedReport()

        const response = await server.inject({
          method: 'POST',
          url: makeUrl(organisationId, registrationId),
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
      })
    })

    describe('error handling', () => {
      it('returns 404 when no report exists for the period', async () => {
        const registration = buildRegistration({
          wasteProcessingType: 'reprocessor'
        })
        const org = buildOrganisationWithRegistration(registration)

        const server = await createTestServer({
          repositories: {
            organisationsRepository: createInMemoryOrganisationsRepository([
              org
            ]),
            wasteRecordsRepository: createInMemoryWasteRecordsRepository([]),
            reportsRepository: createInMemoryReportsRepository()
          },
          featureFlags: createInMemoryFeatureFlags({
            reports: true,
            reportUnsubmit: true
          })
        })

        const response = await server.inject({
          method: 'POST',
          url: makeUrl(org.id, registration.id),
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 409 when report is in_progress', async () => {
        const { server, organisationId, registrationId } =
          await buildServerWithReportInStatus('in_progress')

        const response = await server.inject({
          method: 'POST',
          url: makeUrl(organisationId, registrationId),
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })

      it('returns 409 when report is ready_to_submit', async () => {
        const { server, organisationId, registrationId } =
          await buildServerWithReportInStatus('ready_to_submit')

        const response = await server.inject({
          method: 'POST',
          url: makeUrl(organisationId, registrationId),
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })
    })
  })

  describe('when feature flag is disabled', () => {
    it('returns 404', async () => {
      const organisationId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()

      const server = await createTestServer({
        repositories: {},
        featureFlags: createInMemoryFeatureFlags({
          reports: true,
          reportUnsubmit: false
        })
      })

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(organisationId, registrationId),
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})

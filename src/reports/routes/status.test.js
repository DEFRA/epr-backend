import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  buildOrganisationWithRegistration,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'
import { reportsStatusPath } from './status.js'
import * as reportAudit from '#reports/application/audit.js'

vi.mock('#reports/application/audit.js', () => ({
  auditReportStatusTransition: vi.fn().mockResolvedValue(undefined)
}))

describe(`POST ${reportsStatusPath}`, () => {
  setupAuthContext()

  const makeUrl = (orgId, regId, year, cadence, period) =>
    `/v1/organisations/${orgId}/registrations/${regId}/reports/${year}/${cadence}/${period}/status`

  describe('when feature flag is enabled', () => {
    // Defaults to a report whose manual-entry fields are populated enough
    // for any operator category to pass the completeness check. Tests that
    // want to exercise the incomplete case pass `reportOverrides` that
    // null out the relevant fields.
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

    const buildOrgWithRegistration = (
      registrationOverrides,
      accreditationStatus
    ) => {
      const registration = buildRegistration(registrationOverrides)
      const org = buildOrganisationWithRegistration(
        registration,
        accreditationStatus
      )
      return { org, registration }
    }

    const createServerWithReport = async (
      registrationOverrides = {},
      reportOverrides = {},
      accreditationStatus
    ) => {
      const { org, registration } = buildOrgWithRegistration(
        registrationOverrides,
        accreditationStatus
      )

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([org])

      const reportsRepositoryFactory = createInMemoryReportsRepository()
      const reportsRepository = reportsRepositoryFactory()

      const createdReport = await reportsRepository.createReport(
        buildCreateReportParams({
          organisationId: org.id,
          registrationId: registration.id,
          year: 2025,
          cadence: 'quarterly',
          period: 1,
          startDate: '2025-01-01',
          endDate: '2025-03-31',
          dueDate: '2025-04-20',
          ...COMPLETE_MANUAL_FIELDS,
          ...reportOverrides
        })
      )

      const server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          wasteRecordsRepository: createInMemoryWasteRecordsRepository([]),
          reportsRepository: reportsRepositoryFactory
        },
        featureFlags: createInMemoryFeatureFlags({ reports: true })
      })

      return {
        server,
        organisationId: org.id,
        registrationId: registration.id,
        reportId: createdReport.id,
        reportsRepository
      }
    }

    const createServerWithoutReport = async (
      registrationOverrides = {},
      accreditationStatus
    ) => {
      const { org, registration } = buildOrgWithRegistration(
        registrationOverrides,
        accreditationStatus
      )

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([org])

      const server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          wasteRecordsRepository: createInMemoryWasteRecordsRepository([]),
          reportsRepository: createInMemoryReportsRepository()
        },
        featureFlags: createInMemoryFeatureFlags({ reports: true })
      })

      return {
        server,
        organisationId: org.id,
        registrationId: registration.id
      }
    }

    const postStatus = (
      server,
      orgId,
      regId,
      payload,
      year = 2025,
      cadence = 'quarterly',
      period = 1
    ) =>
      server.inject({
        method: 'POST',
        url: makeUrl(orgId, regId, year, cadence, period),
        payload,
        ...asStandardUser({ linkedOrgId: orgId })
      })

    describe('successful transitions', () => {
      it('advances status to ready_to_submit', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'ready_to_submit', version: 1 }
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(JSON.parse(response.payload)).toEqual({
          status: 'ready_to_submit'
        })
      })
    })

    describe('auditing', () => {
      beforeEach(() => vi.clearAllMocks())

      it('calls auditReportStatusTransition with correct params on successful transition', async () => {
        const { server, organisationId, registrationId, reportId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        await postStatus(server, organisationId, registrationId, {
          status: 'ready_to_submit',
          version: 1
        })

        expect(reportAudit.auditReportStatusTransition).toHaveBeenCalledWith(
          expect.any(Object),
          {
            organisationId,
            registrationId,
            year: 2025,
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
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'ready_to_submit', version: 99 }
        )

        expect(response.statusCode).toBe(StatusCodes.CONFLICT)
      })
    })

    describe('completeness guard', () => {
      it('returns 400 with structured missingFields when tonnageRecycled is null for a registered-only reprocessor', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport(
            { wasteProcessingType: 'reprocessor', accreditationId: undefined },
            {
              recyclingActivity: {
                suppliers: [],
                totalTonnageReceived: 0,
                tonnageRecycled: null,
                tonnageNotRecycled: 10
              }
            }
          )

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'ready_to_submit', version: 1 }
        )

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(JSON.parse(response.payload)).toEqual({
          statusCode: StatusCodes.BAD_REQUEST,
          error: 'Bad Request',
          message: 'Report is incomplete; 1 required field(s) not populated',
          missingFields: ['recyclingActivity.tonnageRecycled']
        })
      })

      it('returns 400 with structured missingFields when prn.totalRevenue is null for an accredited reprocessor', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport(
            { wasteProcessingType: 'reprocessor' },
            {
              prn: {
                issuedTonnage: 100,
                totalRevenue: null,
                freeTonnage: 0,
                averagePricePerTonne: null
              }
            },
            'approved'
          )

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'ready_to_submit', version: 1 }
        )

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
        expect(JSON.parse(response.payload)).toEqual({
          statusCode: StatusCodes.BAD_REQUEST,
          error: 'Bad Request',
          message: 'Report is incomplete; 1 required field(s) not populated',
          missingFields: ['prn.totalRevenue']
        })
      })

      it('report incomplete attaches REPORT_INCOMPLETE code and missingFields in event.reason', async () => {
        const { server, organisationId, registrationId, reportId } =
          await createServerWithReport(
            { wasteProcessingType: 'reprocessor', accreditationId: undefined },
            {
              recyclingActivity: {
                suppliers: [],
                totalTonnageReceived: 0,
                tonnageRecycled: null,
                tonnageNotRecycled: null
              }
            }
          )

        await postStatus(server, organisationId, registrationId, {
          status: 'ready_to_submit',
          version: 1
        })

        expect(server.loggerMocks.warn).toHaveBeenCalledWith({
          message: 'Report is incomplete; 2 required field(s) not populated',
          err: expect.objectContaining({
            isBoom: true,
            code: 'REPORT_INCOMPLETE'
          }),
          event: {
            category: 'http',
            outcome: 'failure',
            action: 'update_report_status',
            reason:
              'missingCount=2 missingFields=[recyclingActivity.tonnageRecycled,recyclingActivity.tonnageNotRecycled]',
            reference: reportId
          }
        })
      })

      it.each(['created', 'rejected', 'cancelled'])(
        'allows transition for reprocessor with %s accreditation (treated as registered-only, prn fields not required)',
        async (accreditationStatus) => {
          const { server, organisationId, registrationId } =
            await createServerWithReport(
              { wasteProcessingType: 'reprocessor' },
              {
                prn: {
                  issuedTonnage: 100,
                  totalRevenue: null,
                  freeTonnage: 0,
                  averagePricePerTonne: null
                }
              },
              accreditationStatus
            )

          const response = await postStatus(
            server,
            organisationId,
            registrationId,
            { status: 'ready_to_submit', version: 1 }
          )

          expect(response.statusCode).toBe(StatusCodes.OK)
        }
      )

      it('allows transition to ready_to_submit when all required fields for the operator category are populated', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'ready_to_submit', version: 1 }
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
      })
    })

    describe('transition guards', () => {
      it('returns 400 for invalid transition from in_progress to submitted', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'submitted', version: 1 }
        )

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      })

      it('returns 400 when attempting to transition from submitted to any status', async () => {
        const {
          server,
          organisationId,
          registrationId,
          reportsRepository,
          reportId
        } = await createServerWithReport({
          wasteProcessingType: 'reprocessor',
          accreditationId: undefined
        })

        await reportsRepository.updateReportStatus({
          reportId,
          version: 1,
          status: 'ready_to_submit',
          changedBy: { id: 'test', name: 'Test', position: 'Officer' }
        })
        await reportsRepository.updateReportStatus({
          reportId,
          version: 2,
          status: 'submitted',
          changedBy: { id: 'test', name: 'Test', position: 'Officer' }
        })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'ready_to_submit', version: 3 }
        )

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      })
    })

    describe('error handling', () => {
      it('returns 404 when no report exists for period', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithoutReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'ready_to_submit', version: 1 }
        )

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 422 for invalid status value', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'banana', version: 1 }
        )

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when version is missing', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          { status: 'ready_to_submit' }
        )

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when payload is empty', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithoutReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await postStatus(
          server,
          organisationId,
          registrationId,
          {}
        )

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 for invalid cadence', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithoutReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await server.inject({
          method: 'POST',
          url: makeUrl(organisationId, registrationId, 2025, 'biweekly', 1),
          payload: { status: 'ready_to_submit', version: 1 },
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })
    })
  })

  describe('when feature flag is disabled', () => {
    it('returns 404', async () => {
      const organisationId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()

      const server = await createTestServer({
        repositories: {},
        featureFlags: createInMemoryFeatureFlags({ reports: false })
      })

      const response = await server.inject({
        method: 'POST',
        url: makeUrl(organisationId, registrationId, 2025, 'quarterly', 1),
        payload: { status: 'ready_to_submit', version: 1 },
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})

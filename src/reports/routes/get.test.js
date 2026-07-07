import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  REPORT_STATUS,
  REPORT_STATUS_SLOT
} from '#reports/domain/report-status.js'
import {
  buildOrganisationWithRegistration,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { reportsGetPath } from './get.js'

/**
 * @import { TestServer } from '#test/create-test-server.js'
 */

describe(`GET ${reportsGetPath}`, () => {
  setupAuthContext()

  const makeUrl = (orgId, regId) =>
    `/v1/organisations/${orgId}/registrations/${regId}/reports/calendar`

  describe('when feature flag is enabled', () => {
    /**
     * @returns {Promise<{ server: TestServer, organisationId: string, registrationId: string }>}
     */
    const createServer = async (
      registrationOverrides = {},
      reportsRepositoryFactory,
      accreditationStatus
    ) => {
      const registration = buildRegistration(registrationOverrides)
      const org = buildOrganisationWithRegistration(
        registration,
        accreditationStatus
      )

      // Use initial-org pattern to preserve accreditation statusHistory
      // (insert() overrides statusHistory to the default 'created' entry).
      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([org])

      const server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          ...(reportsRepositoryFactory && {
            reportsRepository: reportsRepositoryFactory
          })
        },
        featureFlags: createInMemoryFeatureFlags({})
      })

      return {
        server,
        organisationId: org.id,
        registrationId: registration.id
      }
    }

    const makeRequest = (server, orgId, regId) =>
      server.inject({
        method: 'GET',
        url: makeUrl(orgId, regId),
        ...asOperator()
      })

    describe('registered-only operator (no accreditation)', () => {
      it('returns 200', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'exporter',
          accreditationId: undefined
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
      })

      it('returns quarterly cadence', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'exporter',
          accreditationId: undefined
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.cadence).toBe('quarterly')
      })

      it('returns reportingPeriods with dueDate', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'exporter',
          accreditationId: undefined
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        for (const period of payload.reportingPeriods) {
          expect(period).toHaveProperty('dueDate')
        }
      })

      it('returns only ended quarterly periods', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'exporter',
          accreditationId: undefined
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        const currentQuarter = Math.floor(new Date().getUTCMonth() / 3) + 1
        const endedQuarters = currentQuarter - 1

        expect(payload.reportingPeriods).toHaveLength(endedQuarters)
      })

      it('does not include the current in-progress quarter', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'exporter',
          accreditationId: undefined
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        const currentQuarter = Math.floor(new Date().getUTCMonth() / 3) + 1
        const found = payload.reportingPeriods.find(
          (p) => p.period === currentQuarter
        )

        expect(found).toBeUndefined()
      })

      it('omits report field when no persisted report exists', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'exporter',
          accreditationId: undefined
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.reportingPeriods.every((p) => p.report === null)).toBe(
          true
        )
      })

      it('returns submissionNumber 1 for all periods when no reports exist', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'exporter',
          accreditationId: undefined
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(
          payload.reportingPeriods.every((p) => p.submissionNumber === 1)
        ).toBe(true)
      })
    })

    describe('accredited operator', () => {
      const currentYear = new Date().getUTCFullYear()

      it('returns monthly cadence', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          undefined,
          'approved'
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.cadence).toBe('monthly')
      })

      it('returns monthly cadence for suspended accreditation', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          undefined,
          'suspended'
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.cadence).toBe('monthly')
      })

      it('returns only ended monthly periods', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          undefined,
          'approved'
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        const currentMonth = new Date().getUTCMonth() + 1
        const endedMonths = currentMonth - 1

        expect(payload.reportingPeriods).toHaveLength(endedMonths)
      })

      it('includes dueDate for each monthly period', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          undefined,
          'approved'
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        const january = payload.reportingPeriods.find((p) => p.period === 1)
        expect(january.dueDate).toBe(`${currentYear}-02-20`)
      })
    })

    describe('registration with unapproved accreditation', () => {
      it.each(['created', 'rejected', 'cancelled'])(
        'returns quarterly cadence when linked accreditation status is %s',
        async (accreditationStatus) => {
          const { server, organisationId, registrationId } = await createServer(
            {
              wasteProcessingType: 'exporter',
              accreditationId: new ObjectId().toString()
            },
            undefined,
            accreditationStatus
          )

          const response = await makeRequest(
            server,
            organisationId,
            registrationId
          )
          const payload = JSON.parse(response.payload)

          expect(payload.cadence).toBe('quarterly')
        }
      )

      it('returns quarterly cadence when accreditationId points to nothing (unhydrated)', async () => {
        // No accreditation in org, so registration.accreditation hydrates to null
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'exporter',
          accreditationId: new ObjectId().toString()
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.cadence).toBe('quarterly')
      })
    })

    describe('with persisted reports', () => {
      it('includes report object for period with persisted report', async () => {
        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          reportsRepositoryFactory,
          'approved'
        )

        const reportsRepository = reportsRepositoryFactory()
        await reportsRepository.createReport({
          organisationId,
          registrationId,
          year: new Date().getUTCFullYear(),
          cadence: 'monthly',
          period: 1,
          startDate: `${new Date().getUTCFullYear()}-01-01`,
          endDate: `${new Date().getUTCFullYear()}-01-31`,
          dueDate: `${new Date().getUTCFullYear()}-02-20`,
          changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
          submissionNumber: 1,
          material: 'plastic',
          wasteProcessingType: 'exporter',
          source: {
            summaryLogId: 'sl-1',
            lastUploadedAt: '2024-01-15T00:00:00.000Z'
          },
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

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        const january = payload.reportingPeriods.find((p) => p.period === 1)
        expect(january.report).toBeDefined()
        expect(january.report.id).toBeDefined()
        expect(january.report.status).toBe('in_progress')
      })

      it('emits a requires_resubmission skeleton alongside a flagged submitted period', async () => {
        const year = new Date().getUTCFullYear()
        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          reportsRepositoryFactory,
          'approved'
        )

        const reportsRepository = reportsRepositoryFactory()
        const { id } = await reportsRepository.createReport({
          organisationId,
          registrationId,
          year,
          cadence: 'monthly',
          period: 1,
          startDate: `${year}-01-01`,
          endDate: `${year}-01-31`,
          dueDate: `${year}-02-20`,
          changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
          submissionNumber: 1,
          material: 'plastic',
          wasteProcessingType: 'exporter',
          source: { summaryLogId: 'sl-1', lastUploadedAt: `${year}-01-15` },
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

        const changedBy = { id: 'user-1', name: 'Test', position: 'Officer' }
        await reportsRepository.updateReportStatus({
          reportId: id,
          version: 1,
          status: REPORT_STATUS.READY_TO_SUBMIT,
          slot: REPORT_STATUS_SLOT.READY,
          changedBy
        })
        await reportsRepository.updateReportStatus({
          reportId: id,
          version: 2,
          status: REPORT_STATUS.SUBMITTED,
          slot: REPORT_STATUS_SLOT.SUBMITTED,
          changedBy,
          submissionDeclaredBy: 'Test User'
        })
        await reportsRepository.markSubmittedReportsRequiringResubmission({
          organisationId,
          registrationId,
          summaryLogId: 'sl-2',
          uploadedAt: `${year}-05-01T12:00:00.000Z`,
          periods: [{ year, cadence: 'monthly', period: 1 }]
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        const januaryItems = payload.reportingPeriods.filter(
          (p) => p.period === 1
        )
        expect(januaryItems).toHaveLength(2)

        const original = januaryItems.find(
          (p) => p.periodStatus === 'submitted'
        )
        expect(original.submissionNumber).toBe(1)
        expect(original.report.id).toBe(id)

        const skeleton = januaryItems.find(
          (p) => p.periodStatus === 'requires_resubmission'
        )
        expect(skeleton).toMatchObject({
          submissionNumber: 2,
          report: null,
          dueDate: `${year}-02-20`
        })
      })

      it('curates the report shape: excludes activity payloads', async () => {
        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          reportsRepositoryFactory,
          'approved'
        )

        const reportsRepository = reportsRepositoryFactory()
        await reportsRepository.createReport({
          organisationId,
          registrationId,
          year: new Date().getUTCFullYear(),
          cadence: 'monthly',
          period: 1,
          startDate: `${new Date().getUTCFullYear()}-01-01`,
          endDate: `${new Date().getUTCFullYear()}-01-31`,
          dueDate: `${new Date().getUTCFullYear()}-02-20`,
          changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
          submissionNumber: 1,
          material: 'plastic',
          wasteProcessingType: 'exporter',
          source: {
            summaryLogId: 'sl-1',
            lastUploadedAt: '2024-01-15T00:00:00.000Z'
          },
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

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        const january = payload.reportingPeriods.find((p) => p.period === 1)
        expect(Object.keys(january.report).sort()).toStrictEqual(
          [
            'id',
            'status',
            'submissionNumber',
            'submittedAt',
            'submittedBy'
          ].sort()
        )
      })

      it('handles deleted report (null currentReportId)', async () => {
        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          reportsRepositoryFactory,
          'approved'
        )

        const reportsRepository = reportsRepositoryFactory()
        await reportsRepository.createReport({
          organisationId,
          registrationId,
          year: new Date().getUTCFullYear(),
          cadence: 'monthly',
          period: 1,
          startDate: `${new Date().getUTCFullYear()}-01-01`,
          endDate: `${new Date().getUTCFullYear()}-01-31`,
          dueDate: `${new Date().getUTCFullYear()}-02-20`,
          changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
          submissionNumber: 1,
          material: 'plastic',
          wasteProcessingType: 'exporter',
          source: {
            summaryLogId: 'sl-1',
            lastUploadedAt: '2024-01-15T00:00:00.000Z'
          },
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

        await reportsRepository.deleteReport({
          organisationId,
          registrationId,
          year: new Date().getUTCFullYear(),
          cadence: 'monthly',
          period: 1,
          changedBy: { id: 'user-1', name: 'Test', position: 'Officer' }
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        const january = payload.reportingPeriods.find((p) => p.period === 1)
        expect(january.report).toBeNull()
      })

      it('returns submissionNumber from stored report when report exists', async () => {
        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          reportsRepositoryFactory,
          'approved'
        )

        const reportsRepository = reportsRepositoryFactory()
        await reportsRepository.createReport({
          organisationId,
          registrationId,
          year: new Date().getUTCFullYear(),
          cadence: 'monthly',
          period: 1,
          startDate: `${new Date().getUTCFullYear()}-01-01`,
          endDate: `${new Date().getUTCFullYear()}-01-31`,
          dueDate: `${new Date().getUTCFullYear()}-02-20`,
          changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
          submissionNumber: 1,
          material: 'plastic',
          wasteProcessingType: 'exporter',
          source: {
            summaryLogId: 'sl-1',
            lastUploadedAt: '2024-01-15T00:00:00.000Z'
          },
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

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        const january = payload.reportingPeriods.find((p) => p.period === 1)
        expect(january.submissionNumber).toBe(1)
      })

      it('returns submissionNumber 1 for period without a persisted report', async () => {
        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          reportsRepositoryFactory,
          'approved'
        )

        const reportsRepository = reportsRepositoryFactory()
        await reportsRepository.createReport({
          organisationId,
          registrationId,
          year: new Date().getUTCFullYear(),
          cadence: 'monthly',
          period: 1,
          startDate: `${new Date().getUTCFullYear()}-01-01`,
          endDate: `${new Date().getUTCFullYear()}-01-31`,
          dueDate: `${new Date().getUTCFullYear()}-02-20`,
          changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
          submissionNumber: 1,
          material: 'plastic',
          wasteProcessingType: 'exporter',
          source: {
            summaryLogId: 'sl-1',
            lastUploadedAt: '2024-01-15T00:00:00.000Z'
          },
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

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        const february = payload.reportingPeriods.find((p) => p.period === 2)
        expect(february.submissionNumber).toBe(1)
      })

      it('returns report as null for period without persisted report', async () => {
        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          reportsRepositoryFactory,
          'approved'
        )

        const reportsRepository = reportsRepositoryFactory()
        await reportsRepository.createReport({
          organisationId,
          registrationId,
          year: new Date().getUTCFullYear(),
          cadence: 'monthly',
          period: 1,
          startDate: `${new Date().getUTCFullYear()}-01-01`,
          endDate: `${new Date().getUTCFullYear()}-01-31`,
          dueDate: `${new Date().getUTCFullYear()}-02-20`,
          changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
          submissionNumber: 1,
          material: 'plastic',
          wasteProcessingType: 'exporter',
          source: {
            summaryLogId: 'sl-1',
            lastUploadedAt: '2024-01-15T00:00:00.000Z'
          },
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

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        const february = payload.reportingPeriods.find((p) => p.period === 2)
        expect(february.report).toBeNull()
      })
    })

    describe('resubmission draft lifecycle', () => {
      const changedBy = { id: 'user-1', name: 'Test', position: 'Officer' }

      // 28th keeps a valid calendar day for every month; the calendar item's
      // own dates come from the computed period, so only ISO validity matters.
      const monthDates = (year, period) => ({
        startDate: `${year}-${String(period).padStart(2, '0')}-01`,
        endDate: `${year}-${String(period).padStart(2, '0')}-28`,
        dueDate: `${year}-${String(period + 1).padStart(2, '0')}-20`
      })

      const buildCreatePayload = ({
        organisationId,
        registrationId,
        year,
        period,
        submissionNumber
      }) => ({
        organisationId,
        registrationId,
        year,
        cadence: 'monthly',
        period,
        ...monthDates(year, period),
        changedBy,
        submissionNumber,
        material: 'plastic',
        wasteProcessingType: 'exporter',
        source: { summaryLogId: 'sl-1', lastUploadedAt: `${year}-01-15` },
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

      const setup = async () => {
        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          reportsRepositoryFactory,
          'approved'
        )
        return {
          server,
          organisationId,
          registrationId,
          repo: reportsRepositoryFactory()
        }
      }

      const periodItems = async (server, organisationId, registrationId, p) => {
        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        return JSON.parse(response.payload).reportingPeriods.filter(
          (item) => item.period === p
        )
      }

      /**
       * Submits submission 1 for the period (no resubmission flag).
       * @returns {Promise<string>} the submitted report id
       */
      const seedSubmittedPeriod = async (
        repo,
        { organisationId, registrationId, year, period }
      ) => {
        const { id } = await repo.createReport(
          buildCreatePayload({
            organisationId,
            registrationId,
            year,
            period,
            submissionNumber: 1
          })
        )
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
        return id
      }

      /**
       * Submits submission 1, then flags it as requiring resubmission (a later
       * summary log restated the closed period).
       * @returns {Promise<string>} the submitted report id
       */
      const seedFlaggedSubmittedPeriod = async (repo, args) => {
        const id = await seedSubmittedPeriod(repo, args)
        await repo.markSubmittedReportsRequiringResubmission({
          organisationId: args.organisationId,
          registrationId: args.registrationId,
          summaryLogId: 'sl-2',
          uploadedAt: `${args.year}-05-01T12:00:00.000Z`,
          periods: [
            { year: args.year, cadence: 'monthly', period: args.period }
          ]
        })
        return id
      }

      /**
       * Creates the resubmission (submission 2) draft for the period and,
       * optionally, transitions it to a later status.
       * @param {ReturnType<ReturnType<typeof createInMemoryReportsRepository>>} repo
       * @param {{ organisationId: string, registrationId: string, year: number, period: number, toStatus?: string }} options
       * @returns {Promise<string>} the resubmission draft report id
       */
      const seedResubmissionDraft = async (
        repo,
        { organisationId, registrationId, year, period, toStatus }
      ) => {
        const { id } = await repo.createReport(
          buildCreatePayload({
            organisationId,
            registrationId,
            year,
            period,
            submissionNumber: 2
          })
        )
        if (
          toStatus === REPORT_STATUS.READY_TO_SUBMIT ||
          toStatus === REPORT_STATUS.SUBMITTED
        ) {
          await repo.updateReportStatus({
            reportId: id,
            version: 1,
            status: REPORT_STATUS.READY_TO_SUBMIT,
            slot: REPORT_STATUS_SLOT.READY,
            changedBy
          })
        }
        if (toStatus === REPORT_STATUS.SUBMITTED) {
          await repo.updateReportStatus({
            reportId: id,
            version: 2,
            status: REPORT_STATUS.SUBMITTED,
            slot: REPORT_STATUS_SLOT.SUBMITTED,
            changedBy,
            submissionDeclaredBy: 'Test User'
          })
        }
        return id
      }

      it('emits the submitted original and a requires_resubmission slot carrying the ready-to-submit draft', async () => {
        const year = new Date().getUTCFullYear()
        const { server, organisationId, registrationId, repo } = await setup()

        const sub1 = await seedFlaggedSubmittedPeriod(repo, {
          organisationId,
          registrationId,
          year,
          period: 1
        })
        const sub2 = await seedResubmissionDraft(repo, {
          organisationId,
          registrationId,
          year,
          period: 1,
          toStatus: REPORT_STATUS.READY_TO_SUBMIT
        })

        const january = await periodItems(
          server,
          organisationId,
          registrationId,
          1
        )

        expect(january).toHaveLength(2)
        expect(january.map((p) => p.periodStatus).sort()).toStrictEqual([
          'requires_resubmission',
          'submitted'
        ])

        const resub = january.find(
          (p) => p.periodStatus === 'requires_resubmission'
        )
        expect(resub.submissionNumber).toBe(2)
        expect(resub.report).toMatchObject({
          id: sub2,
          status: 'ready_to_submit',
          submissionNumber: 2
        })

        const original = january.find((p) => p.periodStatus === 'submitted')
        expect(original.submissionNumber).toBe(1)
        expect(original.report.id).toBe(sub1)
      })

      it('collapses to a single submitted item once the resubmission is itself submitted', async () => {
        const year = new Date().getUTCFullYear()
        const { server, organisationId, registrationId, repo } = await setup()

        await seedFlaggedSubmittedPeriod(repo, {
          organisationId,
          registrationId,
          year,
          period: 1
        })
        const sub2 = await seedResubmissionDraft(repo, {
          organisationId,
          registrationId,
          year,
          period: 1,
          toStatus: REPORT_STATUS.SUBMITTED
        })

        const january = await periodItems(
          server,
          organisationId,
          registrationId,
          1
        )

        expect(january).toHaveLength(1)
        expect(january[0].periodStatus).toBe('submitted')
        expect(january[0].submissionNumber).toBe(2)
        expect(january[0].report.id).toBe(sub2)
      })

      it('keeps the resubmission slot at requires_resubmission while the draft is in progress', async () => {
        const year = new Date().getUTCFullYear()
        const { server, organisationId, registrationId, repo } = await setup()

        await seedFlaggedSubmittedPeriod(repo, {
          organisationId,
          registrationId,
          year,
          period: 1
        })
        const draftId = await seedResubmissionDraft(repo, {
          organisationId,
          registrationId,
          year,
          period: 1
        })

        const january = await periodItems(
          server,
          organisationId,
          registrationId,
          1
        )

        expect(january).toHaveLength(2)
        const resub = january.find(
          (p) => p.periodStatus === 'requires_resubmission'
        )
        expect(resub.submissionNumber).toBe(2)
        expect(resub.report).toMatchObject({
          id: draftId,
          status: 'in_progress',
          submissionNumber: 2
        })
      })

      it('curates the resubmission item report to the list shape', async () => {
        const year = new Date().getUTCFullYear()
        const { server, organisationId, registrationId, repo } = await setup()

        await seedFlaggedSubmittedPeriod(repo, {
          organisationId,
          registrationId,
          year,
          period: 1
        })
        await seedResubmissionDraft(repo, {
          organisationId,
          registrationId,
          year,
          period: 1,
          toStatus: REPORT_STATUS.READY_TO_SUBMIT
        })

        const january = await periodItems(
          server,
          organisationId,
          registrationId,
          1
        )
        const resub = january.find(
          (p) => p.periodStatus === 'requires_resubmission'
        )

        expect(Object.keys(resub.report).sort()).toStrictEqual(
          [
            'id',
            'status',
            'submissionNumber',
            'submittedAt',
            'submittedBy'
          ].sort()
        )
      })

      it('reverts to the pre-draft skeleton after the resubmission draft is deleted', async () => {
        const year = new Date().getUTCFullYear()
        const { server, organisationId, registrationId, repo } = await setup()

        const sub1 = await seedFlaggedSubmittedPeriod(repo, {
          organisationId,
          registrationId,
          year,
          period: 1
        })
        await seedResubmissionDraft(repo, {
          organisationId,
          registrationId,
          year,
          period: 1,
          toStatus: REPORT_STATUS.READY_TO_SUBMIT
        })
        await repo.deleteReport({
          organisationId,
          registrationId,
          year,
          cadence: 'monthly',
          period: 1,
          submissionNumber: 2,
          changedBy
        })

        const january = await periodItems(
          server,
          organisationId,
          registrationId,
          1
        )

        expect(january).toHaveLength(2)
        const original = january.find((p) => p.periodStatus === 'submitted')
        expect(original.report.id).toBe(sub1)
        const skeleton = january.find(
          (p) => p.periodStatus === 'requires_resubmission'
        )
        expect(skeleton).toMatchObject({ submissionNumber: 2, report: null })
      })

      it('emits an independent submitted and requires_resubmission pair for each flagged period', async () => {
        const year = new Date().getUTCFullYear()
        const { server, organisationId, registrationId, repo } = await setup()

        for (const period of [1, 2]) {
          await seedFlaggedSubmittedPeriod(repo, {
            organisationId,
            registrationId,
            year,
            period
          })
          await seedResubmissionDraft(repo, {
            organisationId,
            registrationId,
            year,
            period,
            toStatus: REPORT_STATUS.READY_TO_SUBMIT
          })
        }

        for (const period of [1, 2]) {
          const items = await periodItems(
            server,
            organisationId,
            registrationId,
            period
          )
          expect(items.map((p) => p.periodStatus).sort()).toStrictEqual([
            'requires_resubmission',
            'submitted'
          ])
        }
      })

      it('emits a single item for a submitted period that was never flagged', async () => {
        const year = new Date().getUTCFullYear()
        const { server, organisationId, registrationId, repo } = await setup()

        await seedSubmittedPeriod(repo, {
          organisationId,
          registrationId,
          year,
          period: 1
        })

        const january = await periodItems(
          server,
          organisationId,
          registrationId,
          1
        )

        expect(january).toHaveLength(1)
        expect(january[0].periodStatus).toBe('submitted')
      })

      it('emits a single in-progress item for a period with only a first-submission draft', async () => {
        const year = new Date().getUTCFullYear()
        const { server, organisationId, registrationId, repo } = await setup()

        await repo.createReport(
          buildCreatePayload({
            organisationId,
            registrationId,
            year,
            period: 1,
            submissionNumber: 1
          })
        )

        const january = await periodItems(
          server,
          organisationId,
          registrationId,
          1
        )

        expect(january).toHaveLength(1)
        expect(january[0].periodStatus).toBe('in_progress')
      })
    })

    describe('periodic reports under a different cadence', () => {
      it('ignores periodic reports stored under a mismatched cadence', async () => {
        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: undefined
          },
          reportsRepositoryFactory
        )

        // Create a report under monthly cadence, but the handler will query quarterly
        const reportsRepository = reportsRepositoryFactory()
        await reportsRepository.createReport({
          organisationId,
          registrationId,
          year: new Date().getUTCFullYear(),
          cadence: 'monthly',
          period: 1,
          startDate: `${new Date().getUTCFullYear()}-01-01`,
          endDate: `${new Date().getUTCFullYear()}-01-31`,
          dueDate: `${new Date().getUTCFullYear()}-02-20`,
          changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
          submissionNumber: 1,
          material: 'plastic',
          wasteProcessingType: 'exporter',
          source: {
            summaryLogId: 'sl-1',
            lastUploadedAt: '2024-01-15T00:00:00.000Z'
          },
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

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(payload.cadence).toBe('quarterly')
        expect(payload.reportingPeriods.every((p) => p.report === null)).toBe(
          true
        )
      })
    })

    describe('periodStatus derivation', () => {
      // Apr 10 2026: monthly periods Jan and Feb are past their due dates
      // (the 20th of the following month) while Mar is ended but not yet due.
      beforeAll(() => {
        vi.useFakeTimers({
          now: new Date('2026-04-10T12:00:00Z'),
          toFake: ['Date']
        })
      })

      afterAll(() => {
        vi.useRealTimers()
      })

      const createAccreditedServer = () =>
        createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          createInMemoryReportsRepository(),
          'approved'
        )

      const findPeriod = async (
        server,
        organisationId,
        registrationId,
        period
      ) => {
        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        return payload.reportingPeriods.find((p) => p.period === period)
      }

      it.each([
        { period: 1, expected: 'overdue', when: 'past its due date' },
        { period: 3, expected: 'due', when: 'before its due date' }
      ])(
        'derives "$expected" for an ended period $when with no report',
        async ({ period, expected }) => {
          const { server, organisationId, registrationId } =
            await createAccreditedServer()

          const item = await findPeriod(
            server,
            organisationId,
            registrationId,
            period
          )

          expect(item.report).toBeNull()
          expect(item.periodStatus).toBe(expected)
        }
      )

      it('derives periodStatus from the stored report status when a report exists', async () => {
        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          reportsRepositoryFactory,
          'approved'
        )

        await reportsRepositoryFactory().createReport({
          organisationId,
          registrationId,
          year: 2026,
          cadence: 'monthly',
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          dueDate: '2026-02-20',
          changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
          submissionNumber: 1,
          material: 'plastic',
          wasteProcessingType: 'exporter',
          source: {
            summaryLogId: 'sl-1',
            lastUploadedAt: '2026-01-15T00:00:00.000Z'
          },
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

        const january = await findPeriod(
          server,
          organisationId,
          registrationId,
          1
        )

        expect(january.report.status).toBe('in_progress')
        expect(january.periodStatus).toBe('in_progress')
      })
    })

    describe('registration not found', () => {
      it('returns 404', async () => {
        const { server, organisationId } = await createServer()
        const unknownRegId = new ObjectId().toString()

        const response = await makeRequest(server, organisationId, unknownRegId)

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })
    })

    describe('service maintainer access', () => {
      it('returns 200 for a service maintainer', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'reprocessor',
          accreditationId: undefined
        })

        const response = await server.inject({
          method: 'GET',
          url: makeUrl(organisationId, registrationId),
          ...asServiceMaintainer()
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
      })
    })
  })

  describe('when feature flag is disabled', () => {
    it('returns 404', async () => {
      const organisationId = new ObjectId().toString()
      const registrationId = new ObjectId().toString()

      const server = await createTestServer({
        repositories: {},
        featureFlags: createInMemoryFeatureFlags({})
      })

      const response = await server.inject({
        method: 'GET',
        url: makeUrl(organisationId, registrationId),
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})

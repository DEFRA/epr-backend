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
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { buildCreateReportParams } from '#reports/repository/contract/test-data.js'
import { reportsPatchPath, buildUpdatedPrn } from './patch.js'

describe(`PATCH ${reportsPatchPath}`, () => {
  setupAuthContext()

  const makeUrl = (orgId, regId, year, cadence, period) =>
    `/v1/organisations/${orgId}/registrations/${regId}/reports/${year}/${cadence}/${period}`

  describe('when feature flag is enabled', () => {
    const createServerWithReport = async (
      registrationOverrides = {},
      reportOverrides = {}
    ) => {
      const registration = buildRegistration(registrationOverrides)
      const org = buildOrganisation({ registrations: [registration] })

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository()
      const organisationsRepository = organisationsRepositoryFactory()
      await organisationsRepository.insert(org)

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

    const createServerWithoutReport = async (registrationOverrides = {}) => {
      const registration = buildRegistration(registrationOverrides)
      const org = buildOrganisation({ registrations: [registration] })

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository()
      const organisationsRepository = organisationsRepositoryFactory()
      await organisationsRepository.insert(org)

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

    const patchReport = (
      server,
      orgId,
      regId,
      payload,
      year = 2025,
      cadence = 'quarterly',
      period = 1
    ) =>
      server.inject({
        method: 'PATCH',
        url: makeUrl(orgId, regId, year, cadence, period),
        payload,
        ...asStandardUser({ linkedOrgId: orgId })
      })

    describe('updating supporting information', () => {
      it('returns 200 with updated report', async () => {
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

        const before = await reportsRepository.findReportById(reportId)
        expect(before.supportingInformation).toBeUndefined()

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { supportingInformation: 'Supply chain disruption' }
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        const payload = JSON.parse(response.payload)
        expect(payload.supportingInformation).toBe('Supply chain disruption')
      })

      it('accepts empty string for supporting information', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { supportingInformation: '' }
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        const payload = JSON.parse(response.payload)
        expect(payload.supportingInformation).toBe('')
      })

      it('increments report version after update', async () => {
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

        const before = await reportsRepository.findReportById(reportId)
        expect(before.version).toBe(1)

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { supportingInformation: 'notes' }
        )

        const payload = JSON.parse(response.payload)
        expect(payload.version).toBe(2)
      })
    })

    describe('updating PRN data fields', () => {
      it('returns 200 when patching prnRevenue', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport(
            {
              wasteProcessingType: 'exporter',
              accreditationId: new ObjectId().toString()
            },
            { prn: { issuedTonnage: 100 } }
          )

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { prnRevenue: 1576.12 }
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        const payload = JSON.parse(response.payload)
        expect(payload.prn.totalRevenue).toBe(1576.12)
      })

      it('returns 200 when patching freePernTonnage', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport(
            {
              wasteProcessingType: 'exporter',
              accreditationId: new ObjectId().toString()
            },
            { prn: { issuedTonnage: 100 } }
          )

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { freePernTonnage: 5 }
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        const payload = JSON.parse(response.payload)
        expect(payload.prn.freeTonnage).toBe(5)
      })

      it('preserves existing prn fields when patching only one field', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport(
            {
              wasteProcessingType: 'exporter',
              accreditationId: new ObjectId().toString()
            },
            { prn: { issuedTonnage: 100 } }
          )

        await patchReport(server, organisationId, registrationId, {
          prnRevenue: 500
        })

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          {
            freePernTonnage: 10
          }
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        const payload = JSON.parse(response.payload)
        expect(payload.prn.totalRevenue).toBe(500)
        expect(payload.prn.freeTonnage).toBe(10)
        expect(payload.prn.averagePricePerTonne).toBeCloseTo(5.56, 1)
      })

      it('returns 422 when prnRevenue is negative', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          })

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { prnRevenue: -1 }
        )

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 400 when freePernTonnage exceeds issued tonnage', async () => {
        const registration = buildRegistration({
          wasteProcessingType: 'exporter',
          accreditationId: new ObjectId().toString()
        })
        const org = buildOrganisation({ registrations: [registration] })

        const organisationsRepositoryFactory =
          createInMemoryOrganisationsRepository()
        const organisationsRepository = organisationsRepositoryFactory()
        await organisationsRepository.insert(org)

        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const reportsRepository = reportsRepositoryFactory()

        await reportsRepository.createReport(
          buildCreateReportParams({
            organisationId: org.id,
            registrationId: registration.id,
            year: 2025,
            cadence: 'quarterly',
            period: 1,
            startDate: '2025-01-01',
            endDate: '2025-03-31',
            dueDate: '2025-04-20',
            prn: { issuedTonnage: 100 }
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

        const response = await patchReport(server, org.id, registration.id, {
          freePernTonnage: 101
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      })

      it('returns 200 when freePernTonnage equals issued tonnage', async () => {
        const registration = buildRegistration({
          wasteProcessingType: 'exporter',
          accreditationId: new ObjectId().toString()
        })
        const org = buildOrganisation({ registrations: [registration] })

        const organisationsRepositoryFactory =
          createInMemoryOrganisationsRepository()
        const organisationsRepository = organisationsRepositoryFactory()
        await organisationsRepository.insert(org)

        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const reportsRepository = reportsRepositoryFactory()

        await reportsRepository.createReport(
          buildCreateReportParams({
            organisationId: org.id,
            registrationId: registration.id,
            year: 2025,
            cadence: 'quarterly',
            period: 1,
            startDate: '2025-01-01',
            endDate: '2025-03-31',
            dueDate: '2025-04-20',
            prn: { issuedTonnage: 50 }
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

        const response = await patchReport(server, org.id, registration.id, {
          freePernTonnage: 50
        })

        expect(response.statusCode).toBe(StatusCodes.OK)
      })
    })

    describe('PRN data status guard', () => {
      it('returns 400 when patching prnRevenue on non-in_progress report', async () => {
        const registration = buildRegistration({
          wasteProcessingType: 'exporter',
          accreditationId: new ObjectId().toString()
        })
        const org = buildOrganisation({ registrations: [registration] })

        const organisationsRepositoryFactory =
          createInMemoryOrganisationsRepository()
        const organisationsRepository = organisationsRepositoryFactory()
        await organisationsRepository.insert(org)

        const reportsRepositoryFactory = createInMemoryReportsRepository()
        const reportsRepository = reportsRepositoryFactory()

        const report = await reportsRepository.createReport(
          buildCreateReportParams({
            organisationId: org.id,
            registrationId: registration.id,
            year: 2025,
            cadence: 'quarterly',
            period: 1,
            startDate: '2025-01-01',
            endDate: '2025-03-31',
            dueDate: '2025-04-20'
          })
        )

        await reportsRepository.updateReport({
          reportId: report.id,
          version: report.version,
          fields: { status: 'ready_to_submit' },
          changedBy: { id: 'user-1', name: 'Test User' }
        })

        const server = await createTestServer({
          repositories: {
            organisationsRepository: organisationsRepositoryFactory,
            wasteRecordsRepository: createInMemoryWasteRecordsRepository([]),
            reportsRepository: reportsRepositoryFactory
          },
          featureFlags: createInMemoryFeatureFlags({ reports: true })
        })

        const response = await patchReport(server, org.id, registration.id, {
          prnRevenue: 100
        })

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      })
    })

    describe('error handling', () => {
      it('returns 422 when status is sent via PATCH', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { status: 'ready_to_submit' }
        )

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 404 when no report exists for period', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithoutReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { supportingInformation: 'notes' }
        )

        expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
      })

      it('returns 422 when payload is empty', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithoutReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          {}
        )

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 when supporting information exceeds max length', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { supportingInformation: 'x'.repeat(2001) }
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
          method: 'PATCH',
          url: makeUrl(organisationId, registrationId, 2025, 'biweekly', 1),
          payload: { supportingInformation: 'notes' },
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
        method: 'PATCH',
        url: makeUrl(organisationId, registrationId, 2025, 'quarterly', 1),
        payload: { supportingInformation: 'notes' },
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})

describe('buildUpdatedPrn', () => {
  it('sets revenue without computing average when freeTonnage is missing', () => {
    const result = buildUpdatedPrn({ issuedTonnage: 100 }, 500, undefined)

    expect(result.totalRevenue).toBe(500)
    expect(result.issuedTonnage).toBe(100)
    expect(result.averagePricePerTonne).toBeUndefined()
  })

  it('computes average when all three values are present', () => {
    const result = buildUpdatedPrn(
      { issuedTonnage: 100, freeTonnage: 0 },
      500,
      undefined
    )

    expect(result.totalRevenue).toBe(500)
    expect(result.averagePricePerTonne).toBe(5)
  })

  it('sets freeTonnage and computes average excluding free tonnage', () => {
    const result = buildUpdatedPrn(
      { issuedTonnage: 100, totalRevenue: 500 },
      undefined,
      10
    )

    expect(result.freeTonnage).toBe(10)
    expect(result.totalRevenue).toBe(500)
    expect(result.averagePricePerTonne).toBeCloseTo(5.56, 1)
  })

  it('returns zero average when denominator is zero', () => {
    const result = buildUpdatedPrn({ issuedTonnage: 50 }, 500, 50)

    expect(result.averagePricePerTonne).toBe(0)
  })

  it('handles undefined existing prn', () => {
    const result = buildUpdatedPrn(undefined, 100, 5)

    expect(result.totalRevenue).toBe(100)
    expect(result.freeTonnage).toBe(5)
    expect(result.averagePricePerTonne).toBeUndefined()
  })
})

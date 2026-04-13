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

    const patchReport = (server, orgId, regId, payload) =>
      server.inject({
        method: 'PATCH',
        url: makeUrl(orgId, regId, 2025, 'quarterly', 1),
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

      it('returns 200 when patching freeTonnage', async () => {
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
          { freeTonnage: 5 }
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
            freeTonnage: 10
          }
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        const payload = JSON.parse(response.payload)
        expect(payload.prn.totalRevenue).toBe(500)
        expect(payload.prn.freeTonnage).toBe(10)
        expect(payload.prn.averagePricePerTonne).toBeCloseTo(5.56, 1)
      })

      it.each([1576.12, 1576.1, 1576, 0, 0.07])(
        'returns 200 when prn-revenue is %s',
        async (prnRevenue) => {
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
            { prnRevenue }
          )

          expect(response.statusCode).toBe(StatusCodes.OK)
        }
      )

      it.each([1576.123, 0.001, 99.999])(
        'returns 422 when prn-revenue is %s (more than 2 decimal places)',
        async (prnRevenue) => {
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
            { prnRevenue }
          )

          expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
        }
      )

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

      it('returns 422 when free-tonnage is not a whole number', async () => {
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
          { freeTonnage: 10.5 }
        )

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 400 when freeTonnage exceeds issued tonnage', async () => {
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
          { freeTonnage: 101 }
        )

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      })

      it('returns 200 when freeTonnage equals issued tonnage', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport(
            {
              wasteProcessingType: 'exporter',
              accreditationId: new ObjectId().toString()
            },
            { prn: { issuedTonnage: 50 } }
          )

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { freeTonnage: 50 }
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
      })
    })

    describe('updating recycling activity fields', () => {
      it('returns 200 when patching tonnageRecycled', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport(
            {
              wasteProcessingType: 'reprocessor',
              accreditationId: undefined
            },
            {
              recyclingActivity: {
                totalTonnageReceived: 200,
                suppliers: [],
                tonnageRecycled: null,
                tonnageNotRecycled: null
              }
            }
          )

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { tonnageRecycled: 100.5 }
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        const payload = JSON.parse(response.payload)
        expect(payload.recyclingActivity.tonnageRecycled).toBe(100.5)
      })

      it('returns 200 when patching tonnageNotRecycled', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport(
            {
              wasteProcessingType: 'reprocessor',
              accreditationId: undefined
            },
            {
              recyclingActivity: {
                totalTonnageReceived: 200,
                suppliers: [],
                tonnageRecycled: null,
                tonnageNotRecycled: null
              }
            }
          )

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { tonnageNotRecycled: 20 }
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        const payload = JSON.parse(response.payload)
        expect(payload.recyclingActivity.tonnageNotRecycled).toBe(20)
      })

      it('returns 200 when patching both tonnage fields in one request', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport(
            {
              wasteProcessingType: 'reprocessor',
              accreditationId: undefined
            },
            {
              recyclingActivity: {
                totalTonnageReceived: 200,
                suppliers: [],
                tonnageRecycled: null,
                tonnageNotRecycled: null
              }
            }
          )

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { tonnageRecycled: 100, tonnageNotRecycled: 20 }
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        const payload = JSON.parse(response.payload)
        expect(payload.recyclingActivity.tonnageRecycled).toBe(100)
        expect(payload.recyclingActivity.tonnageNotRecycled).toBe(20)
      })

      it('preserves existing recyclingActivity fields when patching one field', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport(
            {
              wasteProcessingType: 'reprocessor',
              accreditationId: undefined
            },
            {
              recyclingActivity: {
                totalTonnageReceived: 200,
                suppliers: [],
                tonnageRecycled: null,
                tonnageNotRecycled: null
              }
            }
          )

        await patchReport(server, organisationId, registrationId, {
          tonnageRecycled: 100
        })

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { tonnageNotRecycled: 20 }
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        const payload = JSON.parse(response.payload)
        expect(payload.recyclingActivity.tonnageRecycled).toBe(100)
        expect(payload.recyclingActivity.tonnageNotRecycled).toBe(20)
        expect(payload.recyclingActivity.totalTonnageReceived).toBe(200)
      })

      it('creates recyclingActivity when report has none', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { tonnageRecycled: 50 }
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        const payload = JSON.parse(response.payload)
        expect(payload.recyclingActivity.tonnageRecycled).toBe(50)
      })

      it.each([100.123, 0.001, 20.999])(
        'returns 422 when tonnage-recycled is %s (more than 2 decimal places)',
        async (tonnageRecycled) => {
          const { server, organisationId, registrationId } =
            await createServerWithReport({
              wasteProcessingType: 'reprocessor',
              accreditationId: undefined
            })

          const response = await patchReport(
            server,
            organisationId,
            registrationId,
            { tonnageRecycled }
          )

          expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
        }
      )

      it.each([20.123, 0.001, 5.999])(
        'returns 422 when tonnage-not-recycled is %s (more than 2 decimal places)',
        async (tonnageNotRecycled) => {
          const { server, organisationId, registrationId } =
            await createServerWithReport({
              wasteProcessingType: 'reprocessor',
              accreditationId: undefined
            })

          const response = await patchReport(
            server,
            organisationId,
            registrationId,
            { tonnageNotRecycled }
          )

          expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
        }
      )

      it('returns 422 when tonnageRecycled is negative', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { tonnageRecycled: -1 }
        )

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 400 when patching tonnageRecycled on non-in_progress report', async () => {
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
          changedBy: { id: 'user-1', name: 'Test User' }
        })

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { tonnageRecycled: 100 }
        )

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      })
    })

    describe('PRN data status guard', () => {
      it('returns 400 when patching PRN fields on a report with no PRN record', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReport({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { prnRevenue: 100 }
        )

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      })

      it('returns 400 when patching prnRevenue on non-in_progress report', async () => {
        const {
          server,
          organisationId,
          registrationId,
          reportsRepository,
          reportId
        } = await createServerWithReport({
          wasteProcessingType: 'exporter',
          accreditationId: new ObjectId().toString()
        })

        await reportsRepository.updateReportStatus({
          reportId,
          version: 1,
          status: 'ready_to_submit',
          changedBy: { id: 'user-1', name: 'Test User' }
        })

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { prnRevenue: 100 }
        )

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      })
    })

    describe('error handling', () => {
      it('returns 400 when report is submitted', async () => {
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

        const response = await patchReport(
          server,
          organisationId,
          registrationId,
          { supportingInformation: 'too late' }
        )

        expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      })

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
  it('sets revenue and zeros average when freeTonnage is missing', () => {
    const result = buildUpdatedPrn({ issuedTonnage: 100 }, 500, undefined)

    expect(result.totalRevenue).toBe(500)
    expect(result.issuedTonnage).toBe(100)
    expect(result.averagePricePerTonne).toBe(0)
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

  it('zeros average when issuedTonnage is negative', () => {
    const result = buildUpdatedPrn({ issuedTonnage: -1 }, 100, 5)

    expect(result.totalRevenue).toBe(100)
    expect(result.freeTonnage).toBe(5)
    expect(result.averagePricePerTonne).toBe(0)
  })
})

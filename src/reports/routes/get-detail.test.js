import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asStandardUser } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { buildWasteRecord } from '#repositories/waste-records/contract/test-data.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { reportsGetDetailPath } from './get-detail.js'

describe(`GET ${reportsGetDetailPath}`, () => {
  setupAuthContext()

  const makeUrl = (orgId, regId, year, cadence, period) =>
    `/v1/organisations/${orgId}/registrations/${regId}/reports/${year}/${cadence}/${period}`

  describe('when feature flag is enabled', () => {
    const createServer = async (
      registrationOverrides = {},
      wasteRecordOverrides = []
    ) => {
      const registration = buildRegistration(registrationOverrides)
      const org = buildOrganisation({
        registrations: [registration]
      })

      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository()
      const organisationsRepository = organisationsRepositoryFactory()
      await organisationsRepository.insert(org)

      const wasteRecords = wasteRecordOverrides.map((overrides) =>
        buildWasteRecord({
          ...overrides,
          organisationId: org.id,
          registrationId: registration.id
        })
      )

      const wasteRecordsRepositoryFactory =
        createInMemoryWasteRecordsRepository(wasteRecords)

      const server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          wasteRecordsRepository: wasteRecordsRepositoryFactory
        },
        featureFlags: createInMemoryFeatureFlags({ reports: true })
      })

      return {
        server,
        organisationId: org.id,
        registrationId: registration.id
      }
    }

    const makeRequest = (
      server,
      orgId,
      regId,
      year = 2026,
      cadence = 'quarterly',
      period = 1
    ) =>
      server.inject({
        method: 'GET',
        url: makeUrl(orgId, regId, year, cadence, period),
        ...asStandardUser({ linkedOrgId: orgId })
      })

    describe('registered-only reprocessor', () => {
      it('returns 200', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'reprocessor',
          accreditationId: undefined
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
      })

      it('returns period metadata', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'reprocessor',
          accreditationId: undefined
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId,
          2026,
          'quarterly',
          1
        )
        const payload = JSON.parse(response.payload)

        expect(payload.operatorCategory).toBe('REPROCESSOR_REGISTERED_ONLY')
        expect(payload.cadence).toBe('quarterly')
        expect(payload.year).toBe(2026)
        expect(payload.period).toBe(1)
        expect(payload.startDate).toBe('2026-01-01')
        expect(payload.endDate).toBe('2026-03-31')
      })

      it('returns registration details', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'reprocessor',
          accreditationId: undefined
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.details.material).toBeDefined()
        expect(payload.details.site).toBeDefined()
      })

      it('aggregates waste received from matching records', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          },
          [
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                MONTH_RECEIVED_FOR_REPROCESSING: '2026-01-01',
                TONNAGE_RECEIVED_FOR_RECYCLING: 42.21,
                SUPPLIER_NAME: 'Grantham Waste',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler'
              }
            },
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                MONTH_RECEIVED_FOR_REPROCESSING: '2026-02-01',
                TONNAGE_RECEIVED_FOR_RECYCLING: 38.04,
                SUPPLIER_NAME: 'SUEZ recycling',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Sorter'
              }
            }
          ]
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.sections.wasteReceived.totalTonnage).toBe(80.25)
        expect(payload.sections.wasteReceived.suppliers).toHaveLength(2)
        expect(payload.sections.wasteReceived.suppliers[0].supplierName).toBe(
          'Grantham Waste'
        )
      })

      it('aggregates waste sent on with facility type breakdown', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          },
          [
            {
              type: WASTE_RECORD_TYPE.SENT_ON,
              data: {
                DATE_LOAD_LEFT_SITE: '2026-01-20',
                TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 5,
                FINAL_DESTINATION_FACILITY_TYPE: 'Reprocessor',
                FINAL_DESTINATION_NAME: 'Lincoln recycling'
              }
            },
            {
              type: WASTE_RECORD_TYPE.SENT_ON,
              data: {
                DATE_LOAD_LEFT_SITE: '2026-02-10',
                TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: 3,
                FINAL_DESTINATION_FACILITY_TYPE: 'Exporter',
                FINAL_DESTINATION_NAME: 'Thames exports'
              }
            }
          ]
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.sections.wasteSentOn.totalTonnage).toBe(8)
        expect(payload.sections.wasteSentOn.toReprocessors).toBe(5)
        expect(payload.sections.wasteSentOn.toExporters).toBe(3)
        expect(payload.sections.wasteSentOn.toOtherSites).toBe(0)
        expect(payload.sections.wasteSentOn.destinations).toHaveLength(2)
      })

      it('excludes records outside the requested period', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          },
          [
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                MONTH_RECEIVED_FOR_REPROCESSING: '2026-01-01',
                TONNAGE_RECEIVED_FOR_RECYCLING: 50,
                SUPPLIER_NAME: 'In period',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler'
              }
            },
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                MONTH_RECEIVED_FOR_REPROCESSING: '2026-04-01',
                TONNAGE_RECEIVED_FOR_RECYCLING: 100,
                SUPPLIER_NAME: 'Out of period',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Sorter'
              }
            }
          ]
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId,
          2026,
          'quarterly',
          1
        )
        const payload = JSON.parse(response.payload)

        expect(payload.sections.wasteReceived.totalTonnage).toBe(50)
        expect(payload.sections.wasteReceived.suppliers).toHaveLength(1)
      })

      it('returns lastUploadedAt from most recent version', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          },
          [
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                MONTH_RECEIVED_FOR_REPROCESSING: '2026-01-01',
                TONNAGE_RECEIVED_FOR_RECYCLING: 50,
                SUPPLIER_NAME: 'Test',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler'
              }
            }
          ]
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.lastUploadedAt).toBeDefined()
        expect(payload.lastUploadedAt).not.toBeNull()
      })

      it('returns empty sections when no records exist', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'reprocessor',
          accreditationId: undefined
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.lastUploadedAt).toBeNull()
        expect(payload.sections.wasteReceived.totalTonnage).toBe(0)
        expect(payload.sections.wasteReceived.suppliers).toStrictEqual([])
        expect(payload.sections.wasteSentOn.totalTonnage).toBe(0)
        expect(payload.sections.wasteSentOn.destinations).toStrictEqual([])
      })
    })

    describe('accredited reprocessor', () => {
      it('returns 200 with monthly cadence', async () => {
        const accreditationId = new ObjectId().toString()
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'reprocessor',
          accreditationId
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId,
          2026,
          'monthly',
          2
        )
        const payload = JSON.parse(response.payload)

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(payload.operatorCategory).toBe('REPROCESSOR')
        expect(payload.cadence).toBe('monthly')
        expect(payload.year).toBe(2026)
        expect(payload.period).toBe(2)
        expect(payload.startDate).toBe('2026-02-01')
        expect(payload.endDate).toBe('2026-02-28')
      })

      it('returns registration details', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'reprocessor',
          accreditationId: new ObjectId().toString()
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.details.material).toBeDefined()
        expect(payload.details.site).toBeDefined()
      })

      it('aggregates waste received from matching monthly records', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'reprocessor',
            accreditationId: new ObjectId().toString()
          },
          [
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                DATE_RECEIVED_FOR_REPROCESSING: '2026-02-05',
                TONNAGE_RECEIVED_FOR_RECYCLING: 42.21,
                SUPPLIER_NAME: 'Grantham Waste',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler'
              }
            },
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                DATE_RECEIVED_FOR_REPROCESSING: '2026-02-20',
                TONNAGE_RECEIVED_FOR_RECYCLING: 38.04,
                SUPPLIER_NAME: 'SUEZ recycling',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Sorter'
              }
            },
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                DATE_RECEIVED_FOR_REPROCESSING: '2026-03-01',
                TONNAGE_RECEIVED_FOR_RECYCLING: 100,
                SUPPLIER_NAME: 'Out of period',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Collector'
              }
            }
          ]
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId,
          2026,
          'monthly',
          2
        )
        const payload = JSON.parse(response.payload)

        expect(payload.sections.wasteReceived.totalTonnage).toBe(80.25)
        expect(payload.sections.wasteReceived.suppliers).toHaveLength(2)
      })
    })

    describe('registered-only exporter', () => {
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

      it('returns period metadata', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'exporter',
          accreditationId: undefined
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId,
          2026,
          'quarterly',
          1
        )
        const payload = JSON.parse(response.payload)

        expect(payload.operatorCategory).toBe('EXPORTER_REGISTERED_ONLY')
        expect(payload.cadence).toBe('quarterly')
        expect(payload.year).toBe(2026)
        expect(payload.period).toBe(1)
        expect(payload.startDate).toBe('2026-01-01')
        expect(payload.endDate).toBe('2026-03-31')
      })

      it('returns registration details without site', async () => {
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

        expect(payload.details.material).toBeDefined()
        expect(payload.details.site).toBeUndefined()
      })

      it('aggregates waste received for export from matching records', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: undefined
          },
          [
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                MONTH_RECEIVED_FOR_EXPORT: '2026-01-01',
                TONNAGE_RECEIVED_FOR_EXPORT: 50.25,
                SUPPLIER_NAME: 'Grantham Waste',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler'
              }
            },
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                MONTH_RECEIVED_FOR_EXPORT: '2026-02-01',
                TONNAGE_RECEIVED_FOR_EXPORT: 30,
                SUPPLIER_NAME: 'SUEZ recycling',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Sorter'
              }
            }
          ]
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.sections.wasteReceived.totalTonnage).toBe(80.25)
        expect(payload.sections.wasteReceived.suppliers).toHaveLength(2)
        expect(payload.sections.wasteReceived.suppliers[0].supplierName).toBe(
          'Grantham Waste'
        )
      })

      it('aggregates waste exported with overseas site details', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: undefined
          },
          [
            {
              type: WASTE_RECORD_TYPE.EXPORTED,
              data: {
                DATE_OF_EXPORT: '2026-01-15',
                TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5,
                OSR_NAME: 'EuroPlast Recycling GmbH',
                OSR_ID: '001'
              }
            },
            {
              type: WASTE_RECORD_TYPE.EXPORTED,
              data: {
                DATE_OF_EXPORT: '2026-02-10',
                TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3.47,
                OSR_NAME: 'EuroPlast Recycling GmbH',
                OSR_ID: '001'
              }
            },
            {
              type: WASTE_RECORD_TYPE.EXPORTED,
              data: {
                DATE_OF_EXPORT: '2026-03-05',
                TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3,
                OSR_NAME: 'RecyclePlast SA',
                OSR_ID: '096'
              }
            }
          ]
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(payload.sections.wasteExported.totalTonnage).toBe(11.47)
        expect(payload.sections.wasteExported.overseasSites).toHaveLength(2)
        expect(payload.sections.wasteExported.overseasSites).toStrictEqual([
          { osrId: '001', siteName: 'EuroPlast Recycling GmbH' },
          { osrId: '096', siteName: 'RecyclePlast SA' }
        ])
      })

      it('excludes records outside the requested period', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: undefined
          },
          [
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                MONTH_RECEIVED_FOR_EXPORT: '2026-01-01',
                TONNAGE_RECEIVED_FOR_EXPORT: 50,
                SUPPLIER_NAME: 'In period',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler'
              }
            },
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                MONTH_RECEIVED_FOR_EXPORT: '2026-04-01',
                TONNAGE_RECEIVED_FOR_EXPORT: 100,
                SUPPLIER_NAME: 'Out of period',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Sorter'
              }
            }
          ]
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId,
          2026,
          'quarterly',
          1
        )
        const payload = JSON.parse(response.payload)

        expect(payload.sections.wasteReceived.totalTonnage).toBe(50)
        expect(payload.sections.wasteReceived.suppliers).toHaveLength(1)
      })

      it('returns empty sections when no records exist', async () => {
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

        expect(payload.lastUploadedAt).toBeNull()
        expect(payload.sections.wasteReceived.totalTonnage).toBe(0)
        expect(payload.sections.wasteReceived.suppliers).toStrictEqual([])
        expect(payload.sections.wasteExported.totalTonnage).toBe(0)
        expect(payload.sections.wasteExported.overseasSites).toStrictEqual([])
        expect(payload.sections.wasteSentOn.totalTonnage).toBe(0)
        expect(payload.sections.wasteSentOn.destinations).toStrictEqual([])
      })
    })

    describe('accredited exporter', () => {
      it('returns 200 with monthly cadence', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'exporter',
          accreditationId: new ObjectId().toString()
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId,
          2026,
          'monthly',
          2
        )
        const payload = JSON.parse(response.payload)

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(payload.operatorCategory).toBe('EXPORTER')
        expect(payload.cadence).toBe('monthly')
        expect(payload.year).toBe(2026)
        expect(payload.period).toBe(2)
        expect(payload.startDate).toBe('2026-02-01')
        expect(payload.endDate).toBe('2026-02-28')
      })

      it('aggregates waste received for export from exported records', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          [
            {
              type: WASTE_RECORD_TYPE.EXPORTED,
              data: {
                DATE_RECEIVED_FOR_EXPORT: '2026-02-05',
                DATE_OF_EXPORT: '2026-02-20',
                TONNAGE_RECEIVED_FOR_EXPORT: 50.25,
                TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 48,
                OSR_ID: '001'
              }
            },
            {
              type: WASTE_RECORD_TYPE.EXPORTED,
              data: {
                DATE_RECEIVED_FOR_EXPORT: '2026-02-10',
                DATE_OF_EXPORT: '2026-02-25',
                TONNAGE_RECEIVED_FOR_EXPORT: 30,
                TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 28,
                OSR_ID: '096'
              }
            }
          ]
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId,
          2026,
          'monthly',
          2
        )
        const payload = JSON.parse(response.payload)

        expect(payload.sections.wasteReceived.totalTonnage).toBe(80.25)
        expect(payload.sections.wasteReceived.suppliers).toStrictEqual([])
      })

      it('aggregates waste exported with overseas site details', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          [
            {
              type: WASTE_RECORD_TYPE.EXPORTED,
              data: {
                DATE_RECEIVED_FOR_EXPORT: '2026-02-01',
                DATE_OF_EXPORT: '2026-02-15',
                TONNAGE_RECEIVED_FOR_EXPORT: 50,
                TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 5,
                OSR_ID: '001'
              }
            },
            {
              type: WASTE_RECORD_TYPE.EXPORTED,
              data: {
                DATE_RECEIVED_FOR_EXPORT: '2026-02-05',
                DATE_OF_EXPORT: '2026-02-20',
                TONNAGE_RECEIVED_FOR_EXPORT: 30,
                TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 6.5,
                OSR_ID: '096'
              }
            }
          ]
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId,
          2026,
          'monthly',
          2
        )
        const payload = JSON.parse(response.payload)

        expect(payload.sections.wasteExported.totalTonnage).toBe(11.5)
        expect(payload.sections.wasteExported.overseasSites).toHaveLength(2)
        expect(payload.sections.wasteExported.overseasSites[0].osrId).toBe(
          '001'
        )
        expect(
          payload.sections.wasteExported.overseasSites[0].siteName
        ).toBeUndefined()
      })

      it('filters waste received and exported by different date fields', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          [
            {
              type: WASTE_RECORD_TYPE.EXPORTED,
              data: {
                DATE_RECEIVED_FOR_EXPORT: '2026-01-15',
                DATE_OF_EXPORT: '2026-02-10',
                TONNAGE_RECEIVED_FOR_EXPORT: 42,
                TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 40,
                OSR_ID: '001'
              }
            }
          ]
        )

        const januaryResponse = await makeRequest(
          server,
          organisationId,
          registrationId,
          2026,
          'monthly',
          1
        )
        const january = JSON.parse(januaryResponse.payload)

        expect(january.sections.wasteReceived.totalTonnage).toBe(42)
        expect(january.sections.wasteExported.totalTonnage).toBe(0)

        const februaryResponse = await makeRequest(
          server,
          organisationId,
          registrationId,
          2026,
          'monthly',
          2
        )
        const february = JSON.parse(februaryResponse.payload)

        expect(february.sections.wasteReceived.totalTonnage).toBe(0)
        expect(february.sections.wasteExported.totalTonnage).toBe(40)
      })

      it('returns empty sections when no records exist', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'exporter',
          accreditationId: new ObjectId().toString()
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId,
          2026,
          'monthly',
          2
        )
        const payload = JSON.parse(response.payload)

        expect(payload.lastUploadedAt).toBeNull()
        expect(payload.sections.wasteReceived.totalTonnage).toBe(0)
        expect(payload.sections.wasteReceived.suppliers).toStrictEqual([])
        expect(payload.sections.wasteExported.totalTonnage).toBe(0)
        expect(payload.sections.wasteExported.overseasSites).toStrictEqual([])
        expect(payload.sections.wasteSentOn.totalTonnage).toBe(0)
        expect(payload.sections.wasteSentOn.destinations).toStrictEqual([])
      })
    })

    describe('stored report retrieval', () => {
      const createServerWithReports = async (registrationOverrides = {}) => {
        const registration = buildRegistration(registrationOverrides)
        const org = buildOrganisation({ registrations: [registration] })

        const organisationsRepositoryFactory =
          createInMemoryOrganisationsRepository()
        const organisationsRepository = organisationsRepositoryFactory()
        await organisationsRepository.insert(org)

        const wasteRecordsRepositoryFactory =
          createInMemoryWasteRecordsRepository([])
        const reportsRepositoryFactory = createInMemoryReportsRepository()

        const server = await createTestServer({
          repositories: {
            organisationsRepository: organisationsRepositoryFactory,
            wasteRecordsRepository: wasteRecordsRepositoryFactory,
            reportsRepository: reportsRepositoryFactory
          },
          featureFlags: createInMemoryFeatureFlags({ reports: true })
        })

        return {
          server,
          organisationId: org.id,
          registrationId: registration.id,
          reportsRepositoryFactory
        }
      }

      it('returns stored report when one exists', async () => {
        const {
          server,
          organisationId,
          registrationId,
          reportsRepositoryFactory
        } = await createServerWithReports({
          wasteProcessingType: 'reprocessor',
          accreditationId: undefined
        })

        const reportsRepository = reportsRepositoryFactory()
        await reportsRepository.createReport({
          organisationId,
          registrationId,
          year: 2026,
          cadence: 'quarterly',
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-03-31',
          dueDate: '2026-04-20',
          changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
          material: 'plastic',
          wasteProcessingType: 'reprocessor'
        })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(payload.id).toBeDefined()
        expect(payload.status).toBe('in_progress')
        expect(payload.material).toBe('plastic')
        expect(payload.details).toBeDefined()
      })

      it('returns computed data when no stored report exists', async () => {
        const { server, organisationId, registrationId } =
          await createServerWithReports({
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          })

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(payload.id).toBeUndefined()
        expect(payload.sections).toBeDefined()
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

    describe('parameter validation', () => {
      it('returns 422 for non-numeric year', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'reprocessor',
          accreditationId: undefined
        })

        const response = await server.inject({
          method: 'GET',
          url: makeUrl(
            organisationId,
            registrationId,
            'invalid',
            'quarterly',
            1
          ),
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 for invalid cadence', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'reprocessor',
          accreditationId: undefined
        })

        const response = await server.inject({
          method: 'GET',
          url: makeUrl(organisationId, registrationId, 2026, 'biweekly', 1),
          ...asStandardUser({ linkedOrgId: organisationId })
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      })

      it('returns 422 for period outside 1-12', async () => {
        const { server, organisationId, registrationId } = await createServer({
          wasteProcessingType: 'reprocessor',
          accreditationId: undefined
        })

        const response = await server.inject({
          method: 'GET',
          url: makeUrl(organisationId, registrationId, 2026, 'quarterly', 13),
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
        method: 'GET',
        url: makeUrl(organisationId, registrationId, 2026, 'quarterly', 1),
        ...asStandardUser({ linkedOrgId: organisationId })
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})

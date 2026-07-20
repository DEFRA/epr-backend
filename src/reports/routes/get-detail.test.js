import { ObjectId } from 'mongodb'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { buildSummaryLogRowStateEntry } from '#waste-records/repository/test-data.js'
import {
  buildOrganisation,
  buildOrganisationWithRegistration,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { reportsGetDetailPath } from './get-detail.js'

/**
 * @import { Organisation } from '#domain/organisations/model.js'
 * @import { Registration } from '#domain/organisations/registration.js'
 */

const SUMMARY_LOG_ID = 'sl-1'
const SUBMITTED_AT = new Date('2026-03-31T09:00:00.000Z')

/**
 * Seeds the summary-log row states and the waste balance ledger so the report
 * routes resolve `wasteRecordOverrides` (each `{ type, data }`) as the state at
 * the latest submitted summary log. Empty overrides leave the ledger without a
 * submission, so the report source is null.
 */
const seedRepositories = async (org, registration, wasteRecordOverrides) => {
  const accreditationId = registration.accreditationId ?? null
  const ledgerId = {
    organisationId: org.id,
    registrationId: registration.id,
    accreditationId
  }
  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStateRepository()()
  const ledgerEvents = []
  if (wasteRecordOverrides.length > 0) {
    const entries = wasteRecordOverrides.map((override, index) =>
      buildSummaryLogRowStateEntry({
        rowId: `row-${index}`,
        wasteRecordType: override.type,
        data: override.data
      })
    )
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      ledgerId,
      entries,
      SUMMARY_LOG_ID
    )
    ledgerEvents.push(
      buildLedgerEvent({
        organisationId: org.id,
        registrationId: registration.id,
        accreditationId,
        number: 1,
        createdAt: SUBMITTED_AT,
        payload: { summaryLogId: SUMMARY_LOG_ID, creditTotal: 100 }
      })
    )
  }
  return {
    ledgerRepository: createInMemoryLedgerRepository(ledgerEvents)(),
    summaryLogRowStatesRepository
  }
}

describe(`GET ${reportsGetDetailPath}`, () => {
  setupAuthContext()

  const makeUrl = (orgId, regId, year, cadence, period, submissionNumber = 1) =>
    `/v1/organisations/${orgId}/registrations/${regId}/reports/${year}/${cadence}/${period}/submissions/${submissionNumber}`

  describe('when feature flag is enabled', () => {
    const createServer = async (
      registrationOverrides = {},
      wasteRecordOverrides = [],
      accreditationStatus
    ) => {
      const registration = /** @type {Registration} */ (
        buildRegistration(registrationOverrides)
      )
      const org = buildOrganisationWithRegistration(
        registration,
        accreditationStatus
      )

      // Use initial-org pattern to preserve accreditation statusHistory
      // (insert() overrides statusHistory to the default 'created' entry).
      const organisationsRepositoryFactory =
        createInMemoryOrganisationsRepository([
          /** @type {Organisation} */ (org)
        ])

      const { ledgerRepository, summaryLogRowStatesRepository } =
        await seedRepositories(org, registration, wasteRecordOverrides)

      const server = await createTestServer({
        repositories: {
          organisationsRepository: organisationsRepositoryFactory,
          ledgerRepository,
          summaryLogRowStatesRepository
        },
        featureFlags: createInMemoryFeatureFlags()
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
        ...asOperator()
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
                MONTH_RECEIVED_FOR_REPROCESSING: '2026-01',
                TONNAGE_RECEIVED_FOR_RECYCLING: 42.21,
                SUPPLIER_NAME: 'Grantham Waste',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler'
              }
            },
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                MONTH_RECEIVED_FOR_REPROCESSING: '2026-02',
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

        expect(payload.recyclingActivity.totalTonnageReceived).toBe(80.25)
        expect(payload.recyclingActivity.suppliers).toHaveLength(2)
        expect(payload.recyclingActivity.suppliers[0].supplierName).toBe(
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

        expect(
          payload.wasteSent.tonnageSentToReprocessor +
            payload.wasteSent.tonnageSentToExporter +
            payload.wasteSent.tonnageSentToAnotherSite
        ).toBe(8)
        expect(payload.wasteSent.tonnageSentToReprocessor).toBe(5)
        expect(payload.wasteSent.tonnageSentToExporter).toBe(3)
        expect(payload.wasteSent.tonnageSentToAnotherSite).toBe(0)
        expect(payload.wasteSent.finalDestinations).toHaveLength(2)
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
                MONTH_RECEIVED_FOR_REPROCESSING: '2026-01',
                TONNAGE_RECEIVED_FOR_RECYCLING: 50,
                SUPPLIER_NAME: 'In period',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler'
              }
            },
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                MONTH_RECEIVED_FOR_REPROCESSING: '2026-04',
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

        expect(payload.recyclingActivity.totalTonnageReceived).toBe(50)
        expect(payload.recyclingActivity.suppliers).toHaveLength(1)
      })

      it('returns lastUploadedAt from the latest submitted summary log', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'reprocessor',
            accreditationId: undefined
          },
          [
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                MONTH_RECEIVED_FOR_REPROCESSING: '2026-01',
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

        expect(payload.source.lastUploadedAt).toBeDefined()
        expect(payload.source.lastUploadedAt).not.toBeNull()
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

        expect(payload.source.lastUploadedAt).toBeNull()
        expect(payload.recyclingActivity.totalTonnageReceived).toBe(0)
        expect(payload.recyclingActivity.suppliers).toStrictEqual([])
        expect(
          payload.wasteSent.tonnageSentToReprocessor +
            payload.wasteSent.tonnageSentToExporter +
            payload.wasteSent.tonnageSentToAnotherSite
        ).toBe(0)
        expect(payload.wasteSent.finalDestinations).toStrictEqual([])
      })
    })

    describe('accredited reprocessor', () => {
      it('returns 200 with monthly cadence', async () => {
        const accreditationId = new ObjectId().toString()
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'reprocessor',
            accreditationId
          },
          [],
          'approved'
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

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(payload.operatorCategory).toBe('REPROCESSOR')
        expect(payload.cadence).toBe('monthly')
        expect(payload.year).toBe(2026)
        expect(payload.period).toBe(2)
        expect(payload.startDate).toBe('2026-02-01')
        expect(payload.endDate).toBe('2026-02-28')
      })

      it('returns registration details', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'reprocessor',
            accreditationId: new ObjectId().toString()
          },
          [],
          'approved'
        )

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
          ],
          'approved'
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

        expect(payload.recyclingActivity.totalTonnageReceived).toBe(80.25)
        expect(payload.recyclingActivity.suppliers).toHaveLength(2)
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
                MONTH_RECEIVED_FOR_EXPORT: '2026-01',
                TONNAGE_RECEIVED_FOR_EXPORT: 50.25,
                SUPPLIER_NAME: 'Grantham Waste',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler'
              }
            },
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                MONTH_RECEIVED_FOR_EXPORT: '2026-02',
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

        expect(payload.recyclingActivity.totalTonnageReceived).toBe(80.25)
        expect(payload.recyclingActivity.suppliers).toHaveLength(2)
        expect(payload.recyclingActivity.suppliers[0].supplierName).toBe(
          'Grantham Waste'
        )
      })

      it('routes exported records to unapprovedOverseasSites when overseas-sites repo is unavailable', async () => {
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

        expect(payload.exportActivity.totalTonnageExported).toBe(11.47)
        expect(payload.exportActivity.overseasSites).toStrictEqual([])
        expect(payload.exportActivity.unapprovedOverseasSites).toStrictEqual([
          { orsId: '001', tonnageExported: 8.47 },
          { orsId: '096', tonnageExported: 3 }
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
                MONTH_RECEIVED_FOR_EXPORT: '2026-01',
                TONNAGE_RECEIVED_FOR_EXPORT: 50,
                SUPPLIER_NAME: 'In period',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler'
              }
            },
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                MONTH_RECEIVED_FOR_EXPORT: '2026-04',
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

        expect(payload.recyclingActivity.totalTonnageReceived).toBe(50)
        expect(payload.recyclingActivity.suppliers).toHaveLength(1)
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

        expect(payload.source.lastUploadedAt).toBeNull()
        expect(payload.recyclingActivity.totalTonnageReceived).toBe(0)
        expect(payload.recyclingActivity.suppliers).toStrictEqual([])
        expect(payload.exportActivity.totalTonnageExported).toBe(0)
        expect(payload.exportActivity.overseasSites).toStrictEqual([])
        expect(payload.exportActivity.unapprovedOverseasSites).toStrictEqual([])
        expect(
          payload.wasteSent.tonnageSentToReprocessor +
            payload.wasteSent.tonnageSentToExporter +
            payload.wasteSent.tonnageSentToAnotherSite
        ).toBe(0)
        expect(payload.wasteSent.finalDestinations).toStrictEqual([])
      })
    })

    describe('accredited exporter', () => {
      it('returns 200 with monthly cadence', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          [],
          'approved'
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
          ],
          'approved'
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

        expect(payload.recyclingActivity.totalTonnageReceived).toBe(80.25)
        expect(payload.recyclingActivity.suppliers).toStrictEqual([
          {
            facilityType: null,
            supplierAddress: null,
            supplierEmail: null,
            supplierName: null,
            supplierPhone: null,
            tonnageReceived: 80.25
          }
        ])
      })

      it('routes exported records to unapprovedOverseasSites when overseas-sites repo is unavailable', async () => {
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
          ],
          'approved'
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

        expect(payload.exportActivity.totalTonnageExported).toBe(11.5)
        expect(payload.exportActivity.overseasSites).toStrictEqual([])
        expect(payload.exportActivity.unapprovedOverseasSites).toStrictEqual([
          { orsId: '001', tonnageExported: 5 },
          { orsId: '096', tonnageExported: 6.5 }
        ])
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
          ],
          'approved'
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

        expect(january.recyclingActivity.totalTonnageReceived).toBe(42)
        expect(january.exportActivity.totalTonnageExported).toBe(0)

        const februaryResponse = await makeRequest(
          server,
          organisationId,
          registrationId,
          2026,
          'monthly',
          2
        )
        const february = JSON.parse(februaryResponse.payload)

        expect(february.recyclingActivity.totalTonnageReceived).toBe(0)
        expect(february.exportActivity.totalTonnageExported).toBe(40)
      })

      it('returns empty sections when no records exist', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'exporter',
            accreditationId: new ObjectId().toString()
          },
          [],
          'approved'
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

        expect(payload.source.lastUploadedAt).toBeNull()
        expect(payload.recyclingActivity.totalTonnageReceived).toBe(0)
        expect(payload.recyclingActivity.suppliers).toStrictEqual([])
        expect(payload.exportActivity.totalTonnageExported).toBe(0)
        expect(payload.exportActivity.overseasSites).toStrictEqual([])
        expect(payload.exportActivity.unapprovedOverseasSites).toStrictEqual([])
        expect(
          payload.wasteSent.tonnageSentToReprocessor +
            payload.wasteSent.tonnageSentToExporter +
            payload.wasteSent.tonnageSentToAnotherSite
        ).toBe(0)
        expect(payload.wasteSent.finalDestinations).toStrictEqual([])
      })
    })

    describe('diagnostics warning (ADR 0030)', () => {
      it('logs warning when waste records are excluded due to date field mismatch', async () => {
        const { server, organisationId, registrationId } = await createServer(
          {
            wasteProcessingType: 'reprocessor',
            accreditationId: new ObjectId().toString()
          },
          [
            {
              type: WASTE_RECORD_TYPE.RECEIVED,
              data: {
                MONTH_RECEIVED_FOR_REPROCESSING: '2026-01-01',
                TONNAGE_RECEIVED_FOR_RECYCLING: 75,
                SUPPLIER_NAME: 'Pre-transition Waste',
                ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler'
              }
            }
          ],
          'approved'
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

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(payload.diagnostics.wasteReceivedRecordsExcluded).toBe(1)
        expect(payload.recyclingActivity.totalTonnageReceived).toBe(0)
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

        const reportsRepositoryFactory = createInMemoryReportsRepository()

        const server = await createTestServer({
          repositories: {
            organisationsRepository: organisationsRepositoryFactory,
            reportsRepository: reportsRepositoryFactory
          },
          featureFlags: createInMemoryFeatureFlags()
        })

        return {
          server,
          organisationId: org.id,
          registrationId: registration.id,
          reportsRepositoryFactory
        }
      }

      it('returns stored report with full data sections', async () => {
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
        await reportsRepository.createReport(
          /** @type {import('#reports/repository/port.js').CreateReportParams} */ (
            /** @type {unknown} */ ({
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
              wasteProcessingType: 'reprocessor',
              recyclingActivity: {
                suppliers: [
                  {
                    supplierName: 'Grantham Waste',
                    facilityType: 'Baler',
                    tonnageReceived: 42.21
                  }
                ],
                totalTonnageReceived: 42.21,
                tonnageRecycled: null,
                tonnageNotRecycled: null
              },
              wasteSent: {
                tonnageSentToReprocessor: 5,
                tonnageSentToExporter: 0,
                tonnageSentToAnotherSite: 0,
                finalDestinations: [
                  {
                    recipientName: 'Lincoln recycling',
                    facilityType: 'Reprocessor',
                    tonnageSentOn: 5
                  }
                ]
              },
              prn: null,
              source: {
                summaryLogId: 'sl-1',
                lastUploadedAt: '2026-04-01T21:22:28.351Z'
              }
            })
          )
        )

        const response = await makeRequest(
          server,
          organisationId,
          registrationId
        )
        const payload = JSON.parse(response.payload)

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(payload.id).toBeDefined()
        expect(payload.status.currentStatus).toBe('in_progress')
        expect(payload.status.history).toStrictEqual([
          expect.objectContaining({
            status: 'in_progress',
            at: expect.any(String)
          })
        ])
        expect(payload.material).toBe('plastic')
        expect(payload.wasteProcessingType).toBe('reprocessor')
        expect(payload.details.material).toBe('glass')
        expect(payload.details.site).toBeDefined()
        expect(payload.recyclingActivity).toStrictEqual({
          suppliers: [
            {
              supplierName: 'Grantham Waste',
              facilityType: 'Baler',
              tonnageReceived: 42.21
            }
          ],
          totalTonnageReceived: 42.21,
          tonnageRecycled: null,
          tonnageNotRecycled: null
        })
        expect(payload.wasteSent).toStrictEqual({
          tonnageSentToReprocessor: 5,
          tonnageSentToExporter: 0,
          tonnageSentToAnotherSite: 0,
          finalDestinations: [
            {
              recipientName: 'Lincoln recycling',
              facilityType: 'Reprocessor',
              tonnageSentOn: 5
            }
          ]
        })
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
        expect(payload.recyclingActivity).toBeDefined()
      })

      it('returns 200 with stale field for a stale report', async () => {
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
        await reportsRepository.createReport(
          /** @type {import('#reports/repository/port.js').CreateReportParams} */ (
            /** @type {unknown} */ ({
              organisationId,
              registrationId: String(registrationId),
              year: 2026,
              cadence: 'quarterly',
              period: 1,
              startDate: '2026-01-01',
              endDate: '2026-03-31',
              dueDate: '2026-04-20',
              changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
              material: 'plastic',
              wasteProcessingType: 'reprocessor',
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
              },
              prn: null,
              source: { summaryLogId: 'sl-1', lastUploadedAt: null }
            })
          )
        )

        const uploadedAt = new Date().toISOString()
        await reportsRepository.markActiveReportsStaleForSummaryLog(
          organisationId,
          String(registrationId),
          'sl-new',
          uploadedAt
        )

        const response = await server.inject({
          method: 'GET',
          url: makeUrl(organisationId, registrationId, 2026, 'quarterly', 1),
          ...asOperator()
        })

        const payload = JSON.parse(response.payload)
        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(payload.stale.summaryLogChanged.summaryLogId).toBe('sl-new')
        expect(payload.stale.summaryLogChanged.uploadedAt).toBe(uploadedAt)
      })

      it('returns 200 with stale field for a report made stale by a cancelled PRN', async () => {
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
        await reportsRepository.createReport(
          /** @type {import('#reports/repository/port.js').CreateReportParams} */ (
            /** @type {unknown} */ ({
              organisationId,
              registrationId: String(registrationId),
              year: 2026,
              cadence: 'quarterly',
              period: 1,
              startDate: '2026-01-01',
              endDate: '2026-03-31',
              dueDate: '2026-04-20',
              changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
              material: 'plastic',
              wasteProcessingType: 'reprocessor',
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
              },
              prn: null,
              source: { summaryLogId: 'sl-1', lastUploadedAt: null }
            })
          )
        )

        const prnId = new ObjectId().toString()
        const occurredAt = new Date().toISOString()
        await reportsRepository.markActiveReportsStaleForPrnCancellation({
          organisationId,
          registrationId: String(registrationId),
          year: 2026,
          cadence: 'quarterly',
          period: 1,
          prnId,
          occurredAt
        })

        const response = await server.inject({
          method: 'GET',
          url: makeUrl(organisationId, registrationId, 2026, 'quarterly', 1),
          ...asOperator()
        })

        const payload = JSON.parse(response.payload)
        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(payload.stale.prnCancelled.prnId).toBe(prnId)
        expect(payload.stale.prnCancelled.occurredAt).toBe(occurredAt)
        expect(payload.stale.summaryLogChanged).toBeUndefined()
      })

      it('returns 200 with both stale reasons when a report is stale for both a changed summary log and a cancelled PRN', async () => {
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
        await reportsRepository.createReport(
          /** @type {import('#reports/repository/port.js').CreateReportParams} */ (
            /** @type {unknown} */ ({
              organisationId,
              registrationId: String(registrationId),
              year: 2026,
              cadence: 'quarterly',
              period: 1,
              startDate: '2026-01-01',
              endDate: '2026-03-31',
              dueDate: '2026-04-20',
              changedBy: { id: 'user-1', name: 'Test', position: 'Officer' },
              material: 'plastic',
              wasteProcessingType: 'reprocessor',
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
              },
              prn: null,
              source: { summaryLogId: 'sl-1', lastUploadedAt: null }
            })
          )
        )

        const uploadedAt = new Date().toISOString()
        await reportsRepository.markActiveReportsStaleForSummaryLog(
          organisationId,
          String(registrationId),
          'sl-new',
          uploadedAt
        )

        const prnId = new ObjectId().toString()
        const occurredAt = new Date().toISOString()
        await reportsRepository.markActiveReportsStaleForPrnCancellation({
          organisationId,
          registrationId: String(registrationId),
          year: 2026,
          cadence: 'quarterly',
          period: 1,
          prnId,
          occurredAt
        })

        const response = await server.inject({
          method: 'GET',
          url: makeUrl(organisationId, registrationId, 2026, 'quarterly', 1),
          ...asOperator()
        })

        const payload = JSON.parse(response.payload)
        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(payload.stale.summaryLogChanged.summaryLogId).toBe('sl-new')
        expect(payload.stale.summaryLogChanged.uploadedAt).toBe(uploadedAt)
        expect(payload.stale.prnCancelled.prnId).toBe(prnId)
        expect(payload.stale.prnCancelled.occurredAt).toBe(occurredAt)
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
          ...asOperator()
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
          ...asOperator()
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
          ...asOperator()
        })

        expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
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
          url: makeUrl(organisationId, registrationId, 2026, 'quarterly', 1),
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
        featureFlags: createInMemoryFeatureFlags()
      })

      const response = await server.inject({
        method: 'GET',
        url: makeUrl(organisationId, registrationId, 2026, 'quarterly', 1),
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})

import { toYear } from '#common/helpers/dates/year.js'
import { ObjectId } from 'mongodb'
import { calendarDate } from '#common/helpers/date-formatter.js'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer, asOperator } from '#test/inject-auth.js'
import { partialMock } from '#test/type-helpers.js'
import { entraIdMockAuthTokens } from '#vite/helpers/create-entra-id-test-tokens.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import {
  buildSummaryLogRowStateEntry,
  withNumbers
} from '#waste-records/repository/test-data.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import {
  buildCreateReportParams,
  createAndSubmitReport
} from '#reports/repository/contract/test-data.js'
import {
  accreditation,
  exporter,
  exporterAccreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'

const { buildOrganisation } = createOrganisationBuilders()

const SUMMARY_LOG_ID = 'sl-1'
const SUBMITTED_AT = new Date('2026-03-31T09:00:00.000Z')
const YEAR = toYear(2026)

/**
 * Seeds the summary-log row states and the waste balance ledger so the report
 * routes resolve `wasteRecords` (each `{ type, data }`) as the state at the
 * latest submitted summary log. No records leaves the ledger without a
 * submission, so the report has no source.
 *
 * @param {{ id: string }} org
 * @param {Record<string, any>} registration
 * @param {{ type: string, data: object }[]} wasteRecords
 */
const seedRepositories = async (org, registration, wasteRecords) => {
  const accreditationId = registration.accreditationId ?? null
  const ledgerId = {
    organisationId: org.id,
    registrationId: registration.id,
    accreditationId
  }
  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStatesRepository()()
  const ledgerEvents = []
  if (wasteRecords.length > 0) {
    const entries = wasteRecords.map((record, index) =>
      buildSummaryLogRowStateEntry({
        rowId: `row-${index}`,
        wasteRecordType: record.type,
        data: record.data
      })
    )
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      withNumbers(ledgerId),
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

const registeredOnlyReprocessor = () => ({ registration: reprocessor() })

const registeredOnlyExporter = () => ({ registration: exporter() })

const accreditedReprocessor = () => {
  const accredited = accreditation({ validFrom: '2026-01-01' })
  return {
    registration: reprocessor({
      accreditationId: accredited.id,
      validFrom: '2026-01-01'
    }),
    accreditations: [accredited]
  }
}

const accreditedExporter = () => {
  const accredited = exporterAccreditation({ validFrom: '2026-01-01' })
  return {
    registration: exporter({
      accreditationId: accredited.id,
      validFrom: '2026-01-01'
    }),
    accreditations: [accredited]
  }
}

/**
 * @param {{
 *   registration: Record<string, any>,
 *   accreditations?: object[],
 *   wasteRecords?: { type: string, data: object }[],
 *   reportDataValidation?: boolean
 * }} options
 */
const createServer = async ({
  registration,
  accreditations = [],
  wasteRecords = [],
  reportDataValidation = false
}) => {
  const org = buildOrganisation({
    registrations: [registration],
    accreditations
  })

  const { ledgerRepository, summaryLogRowStatesRepository } =
    await seedRepositories(org, registration, wasteRecords)

  const reportsRepositoryFactory = createInMemoryReportsRepository()

  const server = await createTestServer({
    repositories: {
      organisationsRepository: createInMemoryOrganisationsRepository([
        partialMock(org)
      ]),
      ledgerRepository,
      summaryLogRowStatesRepository,
      reportsRepository: reportsRepositoryFactory
    },
    config: { featureFlags: { reportDataValidation } }
  })

  const registrationPath = `/organisations/${org.orgId}/registrations/${registration.registrationNumber}`

  return {
    server,
    organisationId: org.id,
    registrationId: registration.id,
    reportsRepository: reportsRepositoryFactory(),
    quarterly: (period = 1, { year = YEAR, submissionNumber = 1 } = {}) =>
      `${registrationPath}/reports/${year}/quarterly/${period}/submissions/${submissionNumber}`,
    monthly: (period = 2, { year = YEAR, submissionNumber = 1 } = {}) =>
      `${registrationPath}/accreditations/${year}/reports/monthly/${period}/submissions/${submissionNumber}`
  }
}

/**
 * @param {Awaited<ReturnType<typeof createServer>>['server']} server
 * @param {string} url
 * @param {object} [auth]
 */
const read = async (server, url, auth = asOperator()) => {
  const response = await server.inject({ method: 'GET', url, ...auth })
  return { response, payload: JSON.parse(response.payload) }
}

/**
 * Reads the report expanded with the detail only an admin may see.
 * @param {Awaited<ReturnType<typeof createServer>>['server']} server
 * @param {string} url
 */
const readDetail = async (server, url) =>
  (await read(server, `${url}?expand=detail`, asServiceMaintainer())).payload
    .detail

/** @param {{ wasteSent: Record<string, number> }} payload */
const totalSent = ({ wasteSent }) =>
  wasteSent.tonnageSentToReprocessor +
  wasteSent.tonnageSentToExporter +
  wasteSent.tonnageSentToAnotherSite

describe('GET /organisations/{organisationNumber}/registrations/{registrationNumber}/.../reports/{cadence}/{period}/submissions/{submissionNumber}', () => {
  setupAuthContext()

  it('returns 200 for a regulator standard user', async () => {
    const { server, quarterly } = await createServer(
      registeredOnlyReprocessor()
    )

    const response = await server.inject({
      method: 'GET',
      url: quarterly(),
      headers: {
        Authorization: `Bearer ${entraIdMockAuthTokens.regulatorToken}`
      }
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  it('returns 200 for a service maintainer', async () => {
    const { server, quarterly } = await createServer(
      registeredOnlyReprocessor()
    )

    const { response } = await read(server, quarterly(), asServiceMaintainer())

    expect(response.statusCode).toBe(StatusCodes.OK)
  })

  describe('registered-only reprocessor', () => {
    it('returns period metadata', async () => {
      const { server, quarterly } = await createServer(
        registeredOnlyReprocessor()
      )

      const { response, payload } = await read(server, quarterly())

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(payload).toMatchObject({
        cadence: 'quarterly',
        year: YEAR,
        period: 1,
        startDate: '2026-01-01',
        endDate: '2026-03-31'
      })
    })

    it('details its operator category and registration', async () => {
      const { server, quarterly } = await createServer(
        registeredOnlyReprocessor()
      )

      const detail = await readDetail(server, quarterly())

      expect(detail.operatorCategory).toBe('REPROCESSOR_REGISTERED_ONLY')
      expect(detail.details.material).toBeDefined()
      expect(detail.details.site).toBeDefined()
    })

    it('aggregates waste received from matching records', async () => {
      const { server, quarterly } = await createServer({
        ...registeredOnlyReprocessor(),
        wasteRecords: [
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
      })

      const { payload } = await read(server, quarterly())

      expect(payload.recyclingActivity.totalTonnageReceived).toBe(80.25)
      expect(payload.recyclingActivity.suppliers).toHaveLength(2)
      expect(payload.recyclingActivity.suppliers[0].supplierName).toBe(
        'Grantham Waste'
      )
    })

    it('aggregates waste sent on with facility type breakdown', async () => {
      const { server, quarterly } = await createServer({
        ...registeredOnlyReprocessor(),
        wasteRecords: [
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
      })

      const { payload } = await read(server, quarterly())

      expect(totalSent(payload)).toBe(8)
      expect(payload.wasteSent.tonnageSentToReprocessor).toBe(5)
      expect(payload.wasteSent.tonnageSentToExporter).toBe(3)
      expect(payload.wasteSent.tonnageSentToAnotherSite).toBe(0)
      expect(payload.wasteSent.finalDestinations).toHaveLength(2)
    })

    it('excludes records outside the requested period', async () => {
      const { server, quarterly } = await createServer({
        ...registeredOnlyReprocessor(),
        wasteRecords: [
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
      })

      const { payload } = await read(server, quarterly())

      expect(payload.recyclingActivity.totalTonnageReceived).toBe(50)
      expect(payload.recyclingActivity.suppliers).toHaveLength(1)
    })

    it('returns lastUploadedAt from the latest submitted summary log', async () => {
      const { server, quarterly } = await createServer({
        ...registeredOnlyReprocessor(),
        wasteRecords: [
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
      })

      const { payload } = await read(server, quarterly())

      expect(payload.source.lastUploadedAt).toBe(SUBMITTED_AT.toISOString())
    })

    it('returns empty sections and no source when no records exist', async () => {
      const { server, quarterly } = await createServer(
        registeredOnlyReprocessor()
      )

      const { payload } = await read(server, quarterly())

      expect(payload.source).toBeUndefined()
      expect(payload.recyclingActivity.totalTonnageReceived).toBe(0)
      expect(payload.recyclingActivity.suppliers).toStrictEqual([])
      expect(totalSent(payload)).toBe(0)
      expect(payload.wasteSent.finalDestinations).toStrictEqual([])
    })
  })

  describe('accredited reprocessor', () => {
    it('returns 200 with monthly cadence', async () => {
      const { server, monthly } = await createServer(accreditedReprocessor())

      const { response, payload } = await read(server, monthly(2))

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(payload).toMatchObject({
        cadence: 'monthly',
        year: YEAR,
        period: 2,
        startDate: '2026-02-01',
        endDate: '2026-02-28'
      })
    })

    it('details its operator category and registration', async () => {
      const { server, monthly } = await createServer(accreditedReprocessor())

      const detail = await readDetail(server, monthly())

      expect(detail.operatorCategory).toBe('REPROCESSOR')
      expect(detail.details.material).toBeDefined()
      expect(detail.details.site).toBeDefined()
    })

    it('aggregates waste received from matching monthly records', async () => {
      const { server, monthly } = await createServer({
        ...accreditedReprocessor(),
        wasteRecords: [
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
      })

      const { payload } = await read(server, monthly(2))

      expect(payload.recyclingActivity.totalTonnageReceived).toBe(80.25)
      expect(payload.recyclingActivity.suppliers).toHaveLength(2)
    })
  })

  describe('registered-only exporter', () => {
    it('returns period metadata', async () => {
      const { server, quarterly } = await createServer(registeredOnlyExporter())

      const { response, payload } = await read(server, quarterly())

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(payload).toMatchObject({
        cadence: 'quarterly',
        year: YEAR,
        period: 1,
        startDate: '2026-01-01',
        endDate: '2026-03-31'
      })
    })

    it('details its operator category and registration without site', async () => {
      const { server, quarterly } = await createServer(registeredOnlyExporter())

      const detail = await readDetail(server, quarterly())

      expect(detail.operatorCategory).toBe('EXPORTER_REGISTERED_ONLY')
      expect(detail.details.material).toBeDefined()
      expect(detail.details.site).toBeUndefined()
    })

    it('aggregates waste received for export from matching records', async () => {
      const { server, quarterly } = await createServer({
        ...registeredOnlyExporter(),
        wasteRecords: [
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
      })

      const { payload } = await read(server, quarterly())

      expect(payload.recyclingActivity.totalTonnageReceived).toBe(80.25)
      expect(payload.recyclingActivity.suppliers).toHaveLength(2)
      expect(payload.recyclingActivity.suppliers[0].supplierName).toBe(
        'Grantham Waste'
      )
    })

    it('routes exported records to unapprovedOverseasSites when overseas-sites repo is unavailable', async () => {
      const { server, quarterly } = await createServer({
        ...registeredOnlyExporter(),
        wasteRecords: [
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
      })

      const { payload } = await read(server, quarterly())

      expect(payload.exportActivity.totalTonnageExported).toBe(11.47)
      expect(payload.exportActivity.overseasSites).toStrictEqual([])
      expect(payload.exportActivity.unapprovedOverseasSites).toStrictEqual([
        { orsId: '001', tonnageExported: 8.47 },
        { orsId: '096', tonnageExported: 3 }
      ])
    })

    it('excludes records outside the requested period', async () => {
      const { server, quarterly } = await createServer({
        ...registeredOnlyExporter(),
        wasteRecords: [
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
      })

      const { payload } = await read(server, quarterly())

      expect(payload.recyclingActivity.totalTonnageReceived).toBe(50)
      expect(payload.recyclingActivity.suppliers).toHaveLength(1)
    })

    it('returns empty sections and no source when no records exist', async () => {
      const { server, quarterly } = await createServer(registeredOnlyExporter())

      const { payload } = await read(server, quarterly())

      expect(payload.source).toBeUndefined()
      expect(payload.recyclingActivity.totalTonnageReceived).toBe(0)
      expect(payload.recyclingActivity.suppliers).toStrictEqual([])
      expect(payload.exportActivity.totalTonnageExported).toBe(0)
      expect(payload.exportActivity.overseasSites).toStrictEqual([])
      expect(payload.exportActivity.unapprovedOverseasSites).toStrictEqual([])
      expect(totalSent(payload)).toBe(0)
      expect(payload.wasteSent.finalDestinations).toStrictEqual([])
    })
  })

  describe('accredited exporter', () => {
    it('returns 200 with monthly cadence', async () => {
      const { server, monthly } = await createServer(accreditedExporter())

      const { response, payload } = await read(server, monthly(2))

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(payload).toMatchObject({
        cadence: 'monthly',
        year: YEAR,
        period: 2,
        startDate: '2026-02-01',
        endDate: '2026-02-28'
      })
    })

    it('details its operator category', async () => {
      const { server, monthly } = await createServer(accreditedExporter())

      const detail = await readDetail(server, monthly())

      expect(detail.operatorCategory).toBe('EXPORTER')
    })

    it('aggregates waste received for export from exported records', async () => {
      const { server, monthly } = await createServer({
        ...accreditedExporter(),
        wasteRecords: [
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
      })

      const { payload } = await read(server, monthly(2))

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
      const { server, monthly } = await createServer({
        ...accreditedExporter(),
        wasteRecords: [
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
      })

      const { payload } = await read(server, monthly(2))

      expect(payload.exportActivity.totalTonnageExported).toBe(11.5)
      expect(payload.exportActivity.overseasSites).toStrictEqual([])
      expect(payload.exportActivity.unapprovedOverseasSites).toStrictEqual([
        { orsId: '001', tonnageExported: 5 },
        { orsId: '096', tonnageExported: 6.5 }
      ])
    })

    it('filters waste received and exported by different date fields', async () => {
      const { server, monthly } = await createServer({
        ...accreditedExporter(),
        wasteRecords: [
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
      })

      const { payload: january } = await read(server, monthly(1))

      expect(january.recyclingActivity.totalTonnageReceived).toBe(42)
      expect(january.exportActivity.totalTonnageExported).toBe(0)

      const { payload: february } = await read(server, monthly(2))

      expect(february.recyclingActivity.totalTonnageReceived).toBe(0)
      expect(february.exportActivity.totalTonnageExported).toBe(40)
    })

    it('returns empty sections and no source when no records exist', async () => {
      const { server, monthly } = await createServer(accreditedExporter())

      const { payload } = await read(server, monthly(2))

      expect(payload.source).toBeUndefined()
      expect(payload.recyclingActivity.totalTonnageReceived).toBe(0)
      expect(payload.recyclingActivity.suppliers).toStrictEqual([])
      expect(payload.exportActivity.totalTonnageExported).toBe(0)
      expect(payload.exportActivity.overseasSites).toStrictEqual([])
      expect(payload.exportActivity.unapprovedOverseasSites).toStrictEqual([])
      expect(totalSent(payload)).toBe(0)
      expect(payload.wasteSent.finalDestinations).toStrictEqual([])
    })
  })

  describe('diagnostics warning (ADR 0030)', () => {
    it('excludes waste records whose date field does not match the accredited cadence', async () => {
      const { server, monthly } = await createServer({
        ...accreditedReprocessor(),
        wasteRecords: [
          {
            type: WASTE_RECORD_TYPE.RECEIVED,
            data: {
              MONTH_RECEIVED_FOR_REPROCESSING: '2026-01-01',
              TONNAGE_RECEIVED_FOR_RECYCLING: 75,
              SUPPLIER_NAME: 'Pre-transition Waste',
              ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baler'
            }
          }
        ]
      })

      const { response, payload } = await read(server, monthly(1))
      const detail = await readDetail(server, monthly(1))

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(payload.recyclingActivity.totalTonnageReceived).toBe(0)
      expect(detail.diagnostics.wasteReceivedRecordsExcluded).toBe(1)
    })
  })

  describe('a period the registration does not owe', () => {
    it('returns 404 for a quarter that ended before the registration was approved', async () => {
      const { server, quarterly } = await createServer({
        registration: reprocessor({ validFrom: '2026-04-01' })
      })

      const { response } = await read(server, quarterly(1))

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 for a year the registration was not approved in', async () => {
      const { server, quarterly } = await createServer(
        registeredOnlyReprocessor()
      )

      const { response } = await read(
        server,
        quarterly(1, { year: toYear(2025) })
      )

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it('returns 404 for a quarter that has not ended', async () => {
      const { server, quarterly } = await createServer(
        registeredOnlyReprocessor()
      )

      const { response } = await read(
        server,
        quarterly(1, { year: toYear(2099) })
      )

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })

  describe('stored report retrieval', () => {
    /**
     * @param {Awaited<ReturnType<typeof createServer>>} context
     * @param {object} [overrides]
     */
    const storeReport = (
      { reportsRepository, organisationId, registrationId },
      overrides = {}
    ) =>
      reportsRepository.createReport(
        buildCreateReportParams({
          organisationId,
          registrationId,
          year: YEAR,
          cadence: 'quarterly',
          period: 1,
          startDate: '2026-01-01',
          endDate: '2026-03-31',
          dueDate: '2026-04-20',
          ...overrides
        })
      )

    /**
     * @param {Awaited<ReturnType<typeof createServer>>} context
     * @param {object} [overrides]
     */
    const submitReport = (
      { reportsRepository, organisationId, registrationId },
      overrides = {}
    ) =>
      createAndSubmitReport(reportsRepository, {
        organisationId,
        registrationId,
        year: YEAR,
        cadence: 'quarterly',
        period: 1,
        startDate: calendarDate('2026-01-01'),
        endDate: calendarDate('2026-03-31'),
        dueDate: calendarDate('2026-04-20'),
        ...overrides
      })

    it('returns a stored report for a period the registration no longer owes', async () => {
      const context = await createServer({
        registration: reprocessor({ validFrom: '2026-04-01' })
      })
      await storeReport(context)

      const { response } = await read(context.server, context.quarterly(1))

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('previews the next submission of a period the registration no longer owes', async () => {
      const context = await createServer({
        registration: reprocessor({ validFrom: '2026-04-01' })
      })
      await submitReport(context)

      const { response } = await read(
        context.server,
        context.quarterly(1, { submissionNumber: 2 })
      )

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns stored report with full data sections', async () => {
      const context = await createServer(registeredOnlyReprocessor())
      const recyclingActivity = {
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
      }
      const wasteSent = {
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
      }
      await storeReport(context, { recyclingActivity, wasteSent })

      const { response, payload } = await read(
        context.server,
        context.quarterly()
      )
      const detail = await readDetail(context.server, context.quarterly())

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(payload.status).toBe('in_progress')
      expect(payload.recyclingActivity).toStrictEqual(recyclingActivity)
      expect(payload.wasteSent).toStrictEqual(wasteSent)
      expect(detail.status.history).toStrictEqual([
        expect.objectContaining({
          status: 'in_progress',
          at: expect.any(String)
        })
      ])
      expect(detail.material).toBe('plastic')
      expect(detail.wasteProcessingType).toBe('reprocessor')
      expect(detail.details.material).toBe('glass')
      expect(detail.details.site).toBeDefined()
    })

    it('returns computed data when no stored report exists', async () => {
      const { server, quarterly } = await createServer(
        registeredOnlyReprocessor()
      )

      const { response, payload } = await read(server, quarterly())

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(payload.status).toBe('not_started')
      expect(payload.recyclingActivity).toBeDefined()
    })

    it('returns 200 with stale field for a stale report', async () => {
      const context = await createServer(registeredOnlyReprocessor())
      await storeReport(context)

      const uploadedAt = new Date().toISOString()
      await context.reportsRepository.markActiveReportsStaleForSummaryLog(
        context.organisationId,
        context.registrationId,
        'sl-new',
        uploadedAt
      )

      const { response, payload } = await read(
        context.server,
        context.quarterly()
      )
      const detail = await readDetail(context.server, context.quarterly())

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(payload.stale).toStrictEqual({
        summaryLogChanged: { uploadedAt }
      })
      expect(detail.stale.summaryLogChanged.summaryLogId).toBe('sl-new')
    })

    it('returns 200 with stale field for a report made stale by a cancelled PRN', async () => {
      const context = await createServer(registeredOnlyReprocessor())
      await storeReport(context)

      const prnId = new ObjectId().toString()
      const occurredAt = new Date().toISOString()
      await context.reportsRepository.markActiveReportsStaleForPrnCancellation({
        organisationId: context.organisationId,
        registrationId: context.registrationId,
        year: YEAR,
        cadence: 'quarterly',
        period: 1,
        prnId,
        occurredAt
      })

      const { response, payload } = await read(
        context.server,
        context.quarterly()
      )
      const detail = await readDetail(context.server, context.quarterly())

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(payload.stale).toStrictEqual({ prnCancelled: { occurredAt } })
      expect(detail.stale.prnCancelled.prnId).toBe(prnId)
    })

    it('returns 200 with both stale reasons when a report is stale for both a changed summary log and a cancelled PRN', async () => {
      const context = await createServer(registeredOnlyReprocessor())
      await storeReport(context)

      const uploadedAt = new Date().toISOString()
      await context.reportsRepository.markActiveReportsStaleForSummaryLog(
        context.organisationId,
        context.registrationId,
        'sl-new',
        uploadedAt
      )

      const occurredAt = new Date().toISOString()
      await context.reportsRepository.markActiveReportsStaleForPrnCancellation({
        organisationId: context.organisationId,
        registrationId: context.registrationId,
        year: YEAR,
        cadence: 'quarterly',
        period: 1,
        prnId: new ObjectId().toString(),
        occurredAt
      })

      const { response, payload } = await read(
        context.server,
        context.quarterly()
      )

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(payload.stale).toStrictEqual({
        summaryLogChanged: { uploadedAt },
        prnCancelled: { occurredAt }
      })
    })

    describe('canRequestResubmission field', () => {
      it('is false for computed data when no stored report exists', async () => {
        const { server, quarterly } = await createServer(
          registeredOnlyReprocessor()
        )

        const { response, payload } = await read(server, quarterly())

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(payload.canRequestResubmission).toBe(false)
      })

      it('is true for a plain submitted report with no draft and no prior flag', async () => {
        const context = await createServer(registeredOnlyReprocessor())
        await submitReport(context)

        const { response, payload } = await read(
          context.server,
          context.quarterly()
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(payload.canRequestResubmission).toBe(true)
      })

      it('is false once resubmissionRequired.operatorRequested is already set', async () => {
        const context = await createServer(registeredOnlyReprocessor())
        await submitReport(context)
        await context.reportsRepository.markSubmittedReportRequiringResubmissionByOperator(
          {
            organisationId: context.organisationId,
            registrationId: context.registrationId,
            year: YEAR,
            cadence: 'quarterly',
            period: 1,
            submissionNumber: 1,
            requestedBy: {
              id: 'user-2',
              name: 'Operator',
              position: 'Officer'
            },
            requestedAt: new Date().toISOString()
          }
        )

        const { response, payload } = await read(
          context.server,
          context.quarterly()
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(payload.canRequestResubmission).toBe(false)
      })

      it('is false for a submission superseded by a later submitted resubmission', async () => {
        const context = await createServer(registeredOnlyReprocessor())
        await submitReport(context)
        await submitReport(context, { submissionNumber: 2 })

        const { response, payload } = await read(
          context.server,
          context.quarterly()
        )

        expect(response.statusCode).toBe(StatusCodes.OK)
        expect(payload.canRequestResubmission).toBe(false)
      })
    })
  })

  describe('parameter validation', () => {
    it('returns 422 for non-numeric year', async () => {
      const { server, quarterly } = await createServer(
        registeredOnlyReprocessor()
      )

      const { response } = await read(
        server,
        quarterly().replace(`/${YEAR}/`, '/invalid/')
      )

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('returns 422 for period outside 1-12', async () => {
      const { server, quarterly } = await createServer(
        registeredOnlyReprocessor()
      )

      const { response } = await read(server, quarterly(13))

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe('incompleteSummaryLogRows (PAE-1420)', () => {
    // A received row whose positive tonnage triggers the supplier rule but
    // carries none of the six mandatory supplier fields.
    const incompleteReceived = {
      type: WASTE_RECORD_TYPE.RECEIVED,
      data: {
        MONTH_RECEIVED_FOR_REPROCESSING: '2026-01',
        TONNAGE_RECEIVED_FOR_RECYCLING: 5
      }
    }

    it('returns 200 carrying incompleteSummaryLogRows on the generate branch when the flag is on and data is incomplete', async () => {
      const { server, quarterly } = await createServer({
        ...registeredOnlyReprocessor(),
        wasteRecords: [incompleteReceived],
        reportDataValidation: true
      })

      const { response, payload } = await read(server, quarterly())

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(payload.incompleteSummaryLogRows.total).toBe(6)
      expect(payload.incompleteSummaryLogRows.issues).toHaveLength(6)
      expect(payload.incompleteSummaryLogRows.issues[0]).toEqual(
        expect.objectContaining({
          sheet: expect.any(String),
          rowId: 'row-0',
          field: expect.any(String)
        })
      )
    })

    it('omits incompleteSummaryLogRows when the same data is complete', async () => {
      const { server, quarterly } = await createServer({
        ...registeredOnlyReprocessor(),
        wasteRecords: [
          {
            type: WASTE_RECORD_TYPE.RECEIVED,
            data: {
              MONTH_RECEIVED_FOR_REPROCESSING: '2026-01',
              TONNAGE_RECEIVED_FOR_RECYCLING: 5,
              SUPPLIER_NAME: 'Acme Waste Ltd',
              SUPPLIER_ADDRESS: '1 Depot Road',
              SUPPLIER_POSTCODE: 'AB1 2CD',
              SUPPLIER_EMAIL: 'ops@acme.example',
              SUPPLIER_PHONE_NUMBER: '01234 567890',
              ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 'Baling'
            }
          }
        ],
        reportDataValidation: true
      })

      const { response, payload } = await read(server, quarterly())

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(payload.incompleteSummaryLogRows).toBeUndefined()
    })

    it('omits incompleteSummaryLogRows when the flag is off despite incomplete data', async () => {
      const { server, quarterly } = await createServer({
        ...registeredOnlyReprocessor(),
        wasteRecords: [incompleteReceived]
      })

      const { response, payload } = await read(server, quarterly())

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(payload.incompleteSummaryLogRows).toBeUndefined()
    })
  })
})

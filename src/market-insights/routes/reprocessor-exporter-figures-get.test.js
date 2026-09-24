import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  vi
} from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import {
  asOperator,
  asRegulator,
  asServiceMaintainerRead
} from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  MATERIAL,
  REGULATOR,
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { insertAccreditedOperator } from '#vite/helpers/insert-accredited-operator.js'
import {
  marketInsightsNationReprocessorExporterFiguresPath,
  marketInsightsReprocessorExporterFiguresPath
} from './reprocessor-exporter-figures-get.js'

/** @import { ReprocessorExporterTable } from '#market-insights/application/reprocessor-exporter-table.js' */

/**
 * @param {string} path
 */
const pathFor =
  (path) =>
  /**
   * @param {number} year
   * @param {string} cadence
   * @param {number} period
   */
  (year, cadence, period) =>
    path
      .replace('{year}', String(year))
      .replace('{cadence}', cadence)
      .replace('{period}', String(period))

const ukPath = pathFor(marketInsightsReprocessorExporterFiguresPath)

/**
 * @param {string} nation
 */
const nationPath = (nation) =>
  pathFor(
    marketInsightsNationReprocessorExporterFiguresPath.replace(
      '{nation}',
      nation
    )
  )

const englandPath = nationPath('england')

const injectTable = (server, credentials, url = ukPath(2026, 'monthly', 1)) =>
  server.inject({ method: 'GET', url, ...credentials })

describe(`GET ${marketInsightsReprocessorExporterFiguresPath}`, () => {
  setupAuthContext()

  let server

  beforeAll(async () => {
    server = await createTestServer({})
  })

  afterAll(async () => {
    await server.stop()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('access control', () => {
    it('returns 401 when unauthenticated', async () => {
      const response = await server.inject({
        method: 'GET',
        url: ukPath(2026, 'monthly', 1)
      })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 for an operator, who holds no market-data.read', async () => {
      const response = await injectTable(server, asOperator())

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('returns 200 for an admin tier, which holds market-data.read', async () => {
      const response = await injectTable(server, asServiceMaintainerRead())

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns 200 for a regulator, who holds market-data.read', async () => {
      const response = await injectTable(server, asRegulator())

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('the reporting period', () => {
    it('rejects a quarterly period, since no quarterly publication exists', async () => {
      const response = await injectTable(
        server,
        asRegulator(),
        ukPath(2026, 'quarterly', 1)
      )

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects the month still running, to its last UK moment', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-06-30T22:59:59.999Z'))

      const response = await injectTable(
        server,
        asRegulator(),
        ukPath(2026, 'monthly', 6)
      )

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      expect(JSON.parse(response.payload).periodNotEnded).toEqual({
        period: 6,
        cadence: 'monthly',
        endDate: '2026-06-30'
      })
    })

    it('serves January through the requested period once it has ended', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-06-30T23:30:00.000Z'))

      const response = await injectTable(
        server,
        asRegulator(),
        ukPath(2026, 'monthly', 6)
      )

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(Object.keys(JSON.parse(response.payload).data.months)).toEqual([
        '2026-01',
        '2026-02',
        '2026-03',
        '2026-04',
        '2026-05',
        '2026-06'
      ])
    })
  })

  it('answers with the full grid at zero when nothing has been submitted', async () => {
    const response = await injectTable(server, asRegulator())

    expect(response.statusCode).toBe(StatusCodes.OK)
    const body = JSON.parse(response.payload)
    expect(body.meta).toEqual({ generatedAt: expect.any(String) })
    expect(Object.keys(body.data.months)).toEqual(['2026-01'])
    const january = body.data.months['2026-01']
    expect(Object.keys(january.figures)).toEqual([
      ...TONNAGE_MONITORING_MATERIALS
    ])
    expect(
      january.figures[MATERIAL.WOOD][WASTE_PROCESSING_TYPE.REPROCESSOR]
    ).toEqual({
      tonnageReceived: 0,
      tonnageRecycled: 0,
      tonnageReceivedButNotRecycled: 0,
      tonnageSentOnTotal: 0,
      tonnageSentOnToReprocessor: 0,
      tonnageSentOnToExporter: 0,
      tonnageSentOnToOtherFacilities: 0,
      revisedTonnageIssued: 0,
      totalRevenue: 0,
      averagePricePerTonne: 0,
      operatorCount: 0,
      submittingOperatorCount: 0,
      contributingOperatorCounts: {
        tonnageReceived: 0,
        tonnageRecycled: 0,
        tonnageReceivedButNotRecycled: 0,
        tonnageSentOnTotal: 0,
        tonnageSentOnToReprocessor: 0,
        tonnageSentOnToExporter: 0,
        tonnageSentOnToOtherFacilities: 0,
        revisedTonnageIssued: 0,
        totalRevenue: 0,
        averagePricePerTonne: 0
      }
    })
    expect(
      january.figures[MATERIAL.WOOD][WASTE_PROCESSING_TYPE.EXPORTER]
    ).toEqual({
      tonnageReceived: 0,
      tonnageExported: 0,
      tonnageReceivedButNotExported: 0,
      tonnageStopped: 0,
      tonnageRefused: 0,
      tonnageRepatriated: 0,
      tonnageSentOnTotal: 0,
      tonnageSentOnToReprocessor: 0,
      tonnageSentOnToExporter: 0,
      tonnageSentOnToOtherFacilities: 0,
      revisedTonnageIssued: 0,
      totalRevenue: 0,
      averagePricePerTonne: 0,
      operatorCount: 0,
      submittingOperatorCount: 0,
      contributingOperatorCounts: {
        tonnageReceived: 0,
        tonnageExported: 0,
        tonnageReceivedButNotExported: 0,
        tonnageStopped: 0,
        tonnageRefused: 0,
        tonnageRepatriated: 0,
        tonnageSentOnTotal: 0,
        tonnageSentOnToReprocessor: 0,
        tonnageSentOnToExporter: 0,
        tonnageSentOnToOtherFacilities: 0,
        revisedTonnageIssued: 0,
        totalRevenue: 0,
        averagePricePerTonne: 0
      }
    })
  })
})

/**
 * @param {{ organisationId: string, registrationId: string }} operator
 * @param {number} issuedTonnage
 */
const januaryPrns = (operator, issuedTonnage) => ({
  ...operator,
  year: 2026,
  cadence: 'monthly',
  period: 1,
  prn: {
    issuedTonnage,
    freeTonnage: 0,
    totalRevenue: issuedTonnage * 100,
    averagePricePerTonne: 100
  }
})

/**
 * The four nations the route serves, each spelled as its path segment. The
 * spelling is the contract a client depends on, so it is written out here
 * rather than derived the way the route derives it.
 */
const NATIONS = [
  { segment: 'england', regulator: REGULATOR.EA, issuedTonnage: 100 },
  { segment: 'wales', regulator: REGULATOR.NRW, issuedTonnage: 50 },
  { segment: 'scotland', regulator: REGULATOR.SEPA, issuedTonnage: 20 },
  { segment: 'northern-ireland', regulator: REGULATOR.NIEA, issuedTonnage: 10 }
]

const UK_ISSUED_TONNAGE = NATIONS.reduce(
  (total, { issuedTonnage }) => total + issuedTonnage,
  0
)

describe(`GET ${marketInsightsNationReprocessorExporterFiguresPath}`, () => {
  setupAuthContext()

  /** @type {import('#test/create-test-server.js').TestServer} */
  let server

  beforeAll(async () => {
    const organisationsRepository = createInMemoryOrganisationsRepository()()
    const reportsRepository = createInMemoryReportsRepository()()
    for (const { regulator, issuedTonnage } of NATIONS) {
      const operator = await insertAccreditedOperator(
        organisationsRepository,
        regulator
      )
      await buildSubmittedReport(
        reportsRepository,
        januaryPrns(operator, issuedTonnage)
      )
    }
    server = await createTestServer({
      repositories: { organisationsRepository, reportsRepository }
    })
  })

  afterAll(async () => {
    await server.stop()
  })

  const january2026 = englandPath(2026, 'monthly', 1)

  describe('access control', () => {
    it('returns 401 when unauthenticated', async () => {
      const response = await server.inject({ method: 'GET', url: january2026 })

      expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 for an operator, who holds no market-data.read', async () => {
      const response = await injectTable(server, asOperator(), january2026)

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('returns 200 for a regulator, who holds market-data.read', async () => {
      const response = await injectTable(server, asRegulator(), january2026)

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  it('rejects a quarterly period, as the UK figures do', async () => {
    const response = await injectTable(
      server,
      asRegulator(),
      englandPath(2026, 'quarterly', 1)
    )

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('ends each table with a grand total carrying no average price', async () => {
    const response = await injectTable(server, asRegulator(), january2026)

    /** @type {ReprocessorExporterTable} */
    const payload = JSON.parse(response.payload)
    const { totals } = payload.data.months['2026-01']
    expect(totals[WASTE_PROCESSING_TYPE.REPROCESSOR]).toEqual(
      expect.objectContaining({
        revisedTonnageIssued: NATIONS[0].issuedTonnage,
        totalRevenue: NATIONS[0].issuedTonnage * 100
      })
    )
    expect(totals[WASTE_PROCESSING_TYPE.REPROCESSOR]).not.toHaveProperty(
      'averagePricePerTonne'
    )
  })

  it('rejects a nation outside the four the domain knows', async () => {
    const response = await injectTable(
      server,
      asRegulator(),
      nationPath('cornwall')(2026, 'monthly', 1)
    )

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it.each(NATIONS)(
    'serves $segment the registrations submitted to its own regulator',
    async ({ segment, issuedTonnage }) => {
      const response = await injectTable(
        server,
        asRegulator(),
        nationPath(segment)(2026, 'monthly', 1)
      )

      expect(response.statusCode).toBe(StatusCodes.OK)
      /** @type {ReprocessorExporterTable} */
      const payload = JSON.parse(response.payload)
      const january = payload.data.months['2026-01']
      expect(Object.keys(january.figures)).toEqual([
        ...TONNAGE_MONITORING_MATERIALS
      ])
      expect(
        january.figures[MATERIAL.PLASTIC][WASTE_PROCESSING_TYPE.REPROCESSOR]
      ).toEqual(
        expect.objectContaining({
          revisedTonnageIssued: issuedTonnage,
          totalRevenue: issuedTonnage * 100
        })
      )
    }
  )

  it('serves four nations that add back up to the UK figures', async () => {
    const responses = await Promise.all([
      ...NATIONS.map(({ segment }) =>
        injectTable(
          server,
          asRegulator(),
          nationPath(segment)(2026, 'monthly', 1)
        )
      ),
      injectTable(server, asRegulator(), ukPath(2026, 'monthly', 1))
    ])

    const issued = responses.map((response) => {
      /** @type {ReprocessorExporterTable} */
      const payload = JSON.parse(response.payload)
      return payload.data.months['2026-01'].totals[
        WASTE_PROCESSING_TYPE.REPROCESSOR
      ].revisedTonnageIssued
    })
    const uk = issued.pop()

    expect(issued.reduce((total, nation) => total + nation, 0)).toBe(uk)
    expect(uk).toBe(UK_ISSUED_TONNAGE)
  })
})

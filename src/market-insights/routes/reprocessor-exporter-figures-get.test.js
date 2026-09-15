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
import { MATERIAL, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import { marketInsightsReprocessorExporterFiguresPath } from './reprocessor-exporter-figures-get.js'

const pathFor = (year, cadence, period) =>
  marketInsightsReprocessorExporterFiguresPath
    .replace('{year}', String(year))
    .replace('{cadence}', cadence)
    .replace('{period}', String(period))

const injectTable = (server, credentials, url = pathFor(2026, 'monthly', 1)) =>
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
        url: pathFor(2026, 'monthly', 1)
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
        pathFor(2026, 'quarterly', 1)
      )

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects the month still running, to its last UK moment', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-06-30T22:59:59.999Z'))

      const response = await injectTable(
        server,
        asRegulator(),
        pathFor(2026, 'monthly', 6)
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
        pathFor(2026, 'monthly', 6)
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
    expect(Object.keys(january.figures)).toHaveLength(8)
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
      averagePricePerTonne: 0
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
      averagePricePerTonne: 0
    })
  })
})

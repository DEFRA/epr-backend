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
import { marketInsightsWasteBalancePath } from './waste-balance-get.js'

const pathFor = (year, cadence, period) =>
  marketInsightsWasteBalancePath
    .replace('{year}', String(year))
    .replace('{cadence}', cadence)
    .replace('{period}', String(period))

const injectTable = (server, credentials, url = pathFor(2026, 'monthly', 1)) =>
  server.inject({ method: 'GET', url, ...credentials })

describe(`GET ${marketInsightsWasteBalancePath}`, () => {
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
    it('rejects a year that is not a year', async () => {
      const response = await injectTable(
        server,
        asRegulator(),
        pathFor('twenty', 'monthly', 1)
      )

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects a quarterly period, since no quarterly publication exists', async () => {
      const response = await injectTable(
        server,
        asRegulator(),
        pathFor(2026, 'quarterly', 1)
      )

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects a period no monthly cadence has', async () => {
      const response = await injectTable(
        server,
        asRegulator(),
        pathFor(2026, 'monthly', 13)
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

    it('serves the month that has just ended in UK time, while UTC is still in it', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-06-30T23:30:00.000Z'))

      const response = await injectTable(
        server,
        asRegulator(),
        pathFor(2026, 'monthly', 6)
      )

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  it('answers with the full grid at zero when nothing has been submitted', async () => {
    const response = await injectTable(server, asRegulator())

    expect(response.statusCode).toBe(StatusCodes.OK)
    const body = JSON.parse(response.payload)
    expect(body.meta).toEqual({ generatedAt: expect.any(String) })
    expect(Object.keys(body.data.months)).toEqual(['2026-01'])
    const january = body.data.months['2026-01']
    expect(january.reports).toEqual({ expected: 0, submitted: 0 })
    expect(Object.keys(january.figures)).toHaveLength(8)
    expect(
      january.figures[MATERIAL.WOOD][WASTE_PROCESSING_TYPE.EXPORTER]
    ).toEqual({
      totalCredited: 0,
      eligibleForWasteBalance: 0,
      sentOnDeductions: 0,
      netCredit: 0,
      operatorCount: 0,
      submittingOperatorCount: 0
    })
    expect(body.data.period.reports).toEqual({ expected: 0, submitted: 0 })
    expect(
      body.data.period.operatorCounts[MATERIAL.WOOD][
        WASTE_PROCESSING_TYPE.EXPORTER
      ]
    ).toEqual({ operatorCount: 0, submittingOperatorCount: 0 })
  })
})

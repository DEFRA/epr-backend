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
  TONNAGE_BAND,
  TONNAGE_MONITORING_MATERIALS
} from '#domain/organisations/model.js'
import { assertPresent } from '#test/type-helpers.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { marketInsightsOutstandingReturnsPath } from './outstanding-returns-get.js'

/** @import { TestServer } from '#test/create-test-server.js' */
/** @import { OutstandingReturnsTable } from '#market-insights/application/outstanding-returns.js' */

/**
 * @param {number} year
 * @param {string} cadence
 * @param {number} period
 */
const pathFor = (year, cadence, period) =>
  marketInsightsOutstandingReturnsPath
    .replace('{year}', String(year))
    .replace('{cadence}', cadence)
    .replace('{period}', String(period))

/**
 * @param {TestServer} server
 * @param {object} credentials - auth options for server.inject()
 * @param {string} [url]
 */
const inject = (server, credentials, url = pathFor(2026, 'monthly', 1)) =>
  server.inject({ method: 'GET', url, ...credentials })

describe(`GET ${marketInsightsOutstandingReturnsPath}`, () => {
  setupAuthContext()

  /** @type {TestServer} */
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
      const response = await inject(server, asOperator())

      expect(response.statusCode).toBe(StatusCodes.FORBIDDEN)
    })

    it('returns 200 for an admin tier, which holds market-data.read', async () => {
      const response = await inject(server, asServiceMaintainerRead())

      expect(response.statusCode).toBe(StatusCodes.OK)
    })

    it('returns 200 for a regulator, who holds market-data.read', async () => {
      const response = await inject(server, asRegulator())

      expect(response.statusCode).toBe(StatusCodes.OK)
    })
  })

  describe('the reporting period', () => {
    it('rejects a quarterly period, since no quarterly publication exists', async () => {
      const response = await inject(
        server,
        asRegulator(),
        pathFor(2026, 'quarterly', 1)
      )

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })

    it('rejects the month still running, to its last UK moment', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-06-30T22:59:59.999Z'))

      const response = await inject(
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

    it('serves January through the month that has just ended in UK time', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-03-31T23:30:00.000Z'))

      const response = await inject(
        server,
        asRegulator(),
        pathFor(2026, 'monthly', 3)
      )

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(Object.keys(JSON.parse(response.payload).data.months)).toEqual([
        '2026-01',
        '2026-02',
        '2026-03'
      ])
    })
  })

  it('answers with the full grid at zero when nothing is owed', async () => {
    const response = await inject(server, asRegulator())

    expect(response.statusCode).toBe(StatusCodes.OK)
    /** @type {OutstandingReturnsTable} */
    const body = JSON.parse(response.payload)
    expect(body.meta).toEqual({ generatedAt: expect.any(String) })
    expect(Object.keys(body.data.months)).toEqual(['2026-01'])
    const january = body.data.months[toYearMonth('2026-01')]
    assertPresent(january)
    expect(Object.keys(january.figures)).toEqual(TONNAGE_MONITORING_MATERIALS)
    expect(january.figures[MATERIAL.WOOD]).toEqual({
      [TONNAGE_BAND.UP_TO_500]: 0,
      [TONNAGE_BAND.UP_TO_5000]: 0,
      [TONNAGE_BAND.UP_TO_10000]: 0,
      [TONNAGE_BAND.OVER_10000]: 0
    })
  })
})

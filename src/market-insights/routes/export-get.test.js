import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator, asRegulator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { MARKET_INSIGHTS_EXPORT_STATUS } from '#market-insights/domain/export.js'
import { marketInsightsExportPath } from './export-get.js'

const pathFor = (year, cadence, period) =>
  marketInsightsExportPath
    .replace('{year}', String(year))
    .replace('{cadence}', cadence)
    .replace('{period}', String(period))

const MARCH = pathFor(2026, 'monthly', 3)
const MARCH_PERIOD = { year: 2026, cadence: 'monthly', period: 3 }
const S3_KEY =
  'market-insights/market-insights-2026-monthly-3-2026-09-18-141530.zip'

describe(`GET ${marketInsightsExportPath}`, () => {
  setupAuthContext()

  let server
  let requestExport
  let repository

  beforeEach(async () => {
    requestExport = vi.fn(async () => {})
    server = await createTestServer({
      workers: { marketInsightsExportsWorker: { requestExport } }
    })
    repository = server.app.marketInsightsExportsRepository
  })

  afterEach(async () => {
    vi.useRealTimers()
    await server.stop()
  })

  const request = (credentials, url = MARCH) =>
    server.inject({ method: 'GET', url, ...credentials })

  const bodyOf = async (url = MARCH) =>
    JSON.parse((await request(asRegulator(), url)).payload)

  /** Follow the build this caller is waiting on, as the wait page does. */
  const pollFor = (buildToken) => bodyOf(`${MARCH}?build=${buildToken}`)

  const finishCurrentBuild = async () => {
    const record = await repository.findForPeriod(MARCH_PERIOD)
    await repository.markReady({
      id: record.id,
      buildToken: record.buildToken,
      generatedAt: '2026-09-18T14:15:30.000Z',
      s3Key: S3_KEY,
      now: new Date()
    })
    return record.buildToken
  }

  describe('access control', () => {
    it('returns 401 when unauthenticated', async () => {
      expect(
        (await server.inject({ method: 'GET', url: MARCH })).statusCode
      ).toBe(StatusCodes.UNAUTHORIZED)
    })

    it('returns 403 for an operator, who holds no market-data.read', async () => {
      expect((await request(asOperator())).statusCode).toBe(
        StatusCodes.FORBIDDEN
      )
      expect(requestExport).not.toHaveBeenCalled()
    })
  })

  describe('the reporting period', () => {
    it('rejects a period that has not ended, before anything is enqueued', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-06-30T22:59:59.999Z'))

      const response = await request(asRegulator(), pathFor(2026, 'monthly', 6))

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      expect(JSON.parse(response.payload).periodNotEnded).toMatchObject({
        period: 6,
        cadence: 'monthly'
      })
      expect(requestExport).not.toHaveBeenCalled()
    })

    it('rejects a quarterly period, since no quarterly publication exists', async () => {
      expect(
        (await request(asRegulator(), pathFor(2026, 'quarterly', 1))).statusCode
      ).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
      expect(requestExport).not.toHaveBeenCalled()
    })
  })

  it('starts a build and hands back the build to wait on', async () => {
    const body = await bodyOf()

    expect(body.status).toBe(MARKET_INSIGHTS_EXPORT_STATUS.BUILDING)
    expect(body.buildToken).toEqual(expect.any(String))
    expect(requestExport).toHaveBeenCalledWith({
      exportId: '2026-monthly-03',
      buildToken: body.buildToken,
      year: 2026,
      cadence: 'monthly',
      period: 3,
      months: ['2026-01', '2026-02', '2026-03']
    })
  })

  it('does not start a second build when polled while one is in flight', async () => {
    const { buildToken } = await bodyOf()
    requestExport.mockClear()

    expect(await pollFor(buildToken)).toEqual({
      status: MARKET_INSIGHTS_EXPORT_STATUS.BUILDING,
      buildToken
    })
    expect(requestExport).not.toHaveBeenCalled()
  })

  it('builds once when a prefetch, a scanner and the click all land together', async () => {
    const bodies = await Promise.all(Array.from({ length: 5 }, () => bodyOf()))

    expect(new Set(bodies.map(({ buildToken }) => buildToken)).size).toBe(1)
    expect(requestExport).toHaveBeenCalledOnce()
  })

  it('serves the download to the poller once its own build is ready', async () => {
    await bodyOf()
    const buildToken = await finishCurrentBuild()
    requestExport.mockClear()

    const body = await pollFor(buildToken)

    expect(body.status).toBe(MARKET_INSIGHTS_EXPORT_STATUS.READY)
    expect(body.downloadUrl).toContain(S3_KEY)
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now())
    expect(requestExport).not.toHaveBeenCalled()
  })

  it('names the download for the period and the moment the figures were taken', async () => {
    await bodyOf()
    const buildToken = await finishCurrentBuild()

    const { downloadUrl } = await pollFor(buildToken)

    // What a regulator saves is the name alone, not the prefix the object
    // shares the bucket under.
    expect(decodeURIComponent(downloadUrl)).toContain(
      'filename=market-insights-2026-monthly-3-2026-09-18-141530.zip'
    )
  })

  it('reports a failure to the poller waiting on that build', async () => {
    await bodyOf()
    const record = await repository.findForPeriod(MARCH_PERIOD)
    await repository.markFailed({
      id: record.id,
      buildToken: record.buildToken,
      failureReason: 'The export could not be built',
      now: new Date()
    })
    requestExport.mockClear()

    expect(await pollFor(record.buildToken)).toEqual({
      status: MARKET_INSIGHTS_EXPORT_STATUS.FAILED,
      failureReason: 'The export could not be built'
    })
    expect(requestExport).not.toHaveBeenCalled()
  })

  it('takes a fresh snapshot for a request naming no build, never an earlier one', async () => {
    const first = await bodyOf()
    await finishCurrentBuild()
    requestExport.mockClear()

    const second = await bodyOf()

    expect(second.status).toBe(MARKET_INSIGHTS_EXPORT_STATUS.BUILDING)
    expect(second.buildToken).not.toBe(first.buildToken)
    expect(requestExport).toHaveBeenCalledOnce()
  })

  it('moves a poller on to the build that took the period over', async () => {
    const stale = await bodyOf()
    await finishCurrentBuild()
    const current = await bodyOf()

    const body = await pollFor(stale.buildToken)

    expect(body.status).toBe(MARKET_INSIGHTS_EXPORT_STATUS.BUILDING)
    expect(body.buildToken).toBe(current.buildToken)
  })

  it('keeps each reporting period to its own export', async () => {
    await bodyOf()
    await bodyOf(pathFor(2026, 'monthly', 2))

    expect(
      requestExport.mock.calls.map(([command]) => command.exportId)
    ).toEqual(['2026-monthly-03', '2026-monthly-02'])
  })
})

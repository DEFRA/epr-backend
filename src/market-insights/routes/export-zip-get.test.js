import unzipper from 'unzipper'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator, asRegulator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { marketInsightsExportZipPath } from './export-zip-get.js'

const pathFor = (year, cadence, period) =>
  marketInsightsExportZipPath
    .replace('{year}', String(year))
    .replace('{cadence}', cadence)
    .replace('{period}', String(period))

const MARCH = pathFor(2026, 'monthly', 3)

describe(`GET ${marketInsightsExportZipPath}`, () => {
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

  const request = (credentials, url = MARCH) =>
    server.inject({ method: 'GET', url, ...credentials })

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
    })
  })

  describe('the reporting period', () => {
    it('rejects a period that has not ended', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-06-30T22:59:59.999Z'))

      const response = await request(asRegulator(), pathFor(2026, 'monthly', 6))

      expect(response.statusCode).toBe(StatusCodes.BAD_REQUEST)
      expect(JSON.parse(response.payload).periodNotEnded).toMatchObject({
        period: 6,
        cadence: 'monthly'
      })
    })

    it('rejects a quarterly period, since no quarterly publication exists', async () => {
      expect(
        (await request(asRegulator(), pathFor(2026, 'quarterly', 1))).statusCode
      ).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  it('streams back a zip holding every dataset behind the pages', async () => {
    const response = await request(asRegulator())

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(response.headers['content-type']).toContain('application/zip')

    const directory = await unzipper.Open.buffer(response.rawPayload)
    expect(directory.files.map((file) => file.path).sort()).toEqual([
      'england-exporter.csv',
      'england-reprocessor.csv',
      'manifest.csv',
      'northern-ireland-exporter.csv',
      'northern-ireland-reprocessor.csv',
      'outstanding-returns.csv',
      'reports.csv',
      'scotland-exporter.csv',
      'scotland-reprocessor.csv',
      'uk-exporter.csv',
      'uk-reprocessor.csv',
      'wales-exporter.csv',
      'wales-reprocessor.csv',
      'waste-balance.csv'
    ])
  })

  it('names the download for the period it holds and the second it was taken', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-18T14:15:30.000Z'))

    const response = await request(asRegulator())

    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="market-insights-2026-monthly-3-2026-09-18-141530.zip"'
    )
  })
})

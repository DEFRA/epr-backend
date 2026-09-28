import ExcelJS from 'exceljs'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator, asRegulator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import {
  readPublishedWorkbook,
  sheet
} from '#market-insights/application/workbook/published-workbook-test-helpers.js'
import { marketInsightsWorkbookPath } from './workbook-get.js'

const pathFor = (year, cadence, period) =>
  marketInsightsWorkbookPath
    .replace('{year}', String(year))
    .replace('{cadence}', cadence)
    .replace('{period}', String(period))

const MARCH = pathFor(2026, 'monthly', 3)

describe(`GET ${marketInsightsWorkbookPath}`, () => {
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

  describe('the workbook returned', () => {
    let response
    /** @type {ExcelJS.Workbook} */
    let workbook

    beforeAll(async () => {
      response = await request(asRegulator())
      workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(response.rawPayload)
    })

    it('is an Excel workbook', () => {
      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(response.headers['content-type']).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
    })

    it('has every published tab, in the published order', async () => {
      const published = await readPublishedWorkbook()

      expect(workbook.worksheets.map(({ name }) => name)).toEqual(
        published.worksheets.map(({ name }) => name)
      )
    })

    it('covers the year up to the requested period', () => {
      expect(
        sheet(workbook, WORKSHEET_NAME.WASTE_BALANCE).getCell('A5').value
      ).toBe(
        'The table below shows the UK credited waste balance for January to March 2026'
      )
    })
  })

  it('names the download for the period it holds and the second it was taken', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-18T14:15:30.000Z'))

    const response = await request(asRegulator())

    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="market-insights-2026-monthly-3-2026-09-18-141530.xlsx"'
    )
  })
})

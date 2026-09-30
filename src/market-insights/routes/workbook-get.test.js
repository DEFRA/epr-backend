import ExcelJS from 'exceljs'
import { StatusCodes } from 'http-status-codes'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator, asRegulator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { insertAccreditedOperator } from '#vite/helpers/insert-accredited-operator.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { buildMarketInsightsWorkbook } from '#market-insights/application/build-workbook.js'
import {
  PUBLISHED_EXTRACTION,
  readParamsFor,
  readPublishedWorkbook,
  reread
} from '#market-insights/application/workbook/published-workbook-test-helpers.js'
import { marketInsightsWorkbookPath } from './workbook-get.js'

/** @import { ServerInjectResponse } from '@hapi/hapi' */
/** @import { TestServer } from '#test/create-test-server.js' */

/**
 * @param {ServerInjectResponse} response
 * @returns {Promise<ExcelJS.Workbook>}
 */
const workbookIn = async (response) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(new Uint8Array(response.rawPayload).buffer)
  return workbook
}

/**
 * Every cell's value in the workbook, keyed by tab and address.
 *
 * @param {ExcelJS.Workbook} workbook
 * @returns {Record<string, unknown>}
 */
const cellsOf = (workbook) => {
  /** @type {Record<string, unknown>} */
  const cells = {}
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cells[`${worksheet.name}!${cell.address}`] = cell.value
      })
    })
  }
  return cells
}

/**
 * @param {number} year
 * @param {string} cadence
 * @param {number} period
 */
const pathFor = (year, cadence, period) =>
  marketInsightsWorkbookPath
    .replace('{year}', String(year))
    .replace('{cadence}', cadence)
    .replace('{period}', String(period))

const MARCH = pathFor(2026, 'monthly', 3)

describe(`GET ${marketInsightsWorkbookPath}`, () => {
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

  /**
   * @param {object} credentials - auth options for server.inject()
   * @param {string} [url]
   */
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
    /** @type {ServerInjectResponse} */
    let response
    /** @type {ExcelJS.Workbook} */
    let workbook

    beforeAll(async () => {
      response = await request(asRegulator())
      workbook = await workbookIn(response)
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
  })

  it('names the download for the period it holds and the second it was taken', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-18T14:15:30.000Z'))

    const response = await request(asRegulator())

    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="market-insights-2026-monthly-3-2026-09-18-141530.xlsx"'
    )
  })

  describe('over a register with an operator owing returns', () => {
    const JANUARY_TO_MARCH = ['2026-01', '2026-02', '2026-03'].map(toYearMonth)
    const register = readParamsFor(JANUARY_TO_MARCH)

    /** @type {TestServer} */
    let seededServer

    beforeAll(async () => {
      const operator = await insertAccreditedOperator(
        register.organisationsRepository
      )
      await buildSubmittedReport(register.reportsRepository, {
        ...operator,
        year: 2026,
        cadence: 'monthly',
        period: 1
      })
      seededServer = await createTestServer({
        repositories: {
          ledgerRepository: register.ledgerRepository,
          summaryLogRowStatesRepository: register.summaryLogRowStatesRepository,
          organisationsRepository: register.organisationsRepository,
          overseasSitesRepository: register.overseasSitesRepository,
          reportsRepository: register.reportsRepository
        }
      })
    })

    afterAll(async () => {
      await seededServer.stop()
    })

    /**
     * @param {string} url
     */
    const download = async (url) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(PUBLISHED_EXTRACTION)
      const response = await seededServer.inject({
        method: 'GET',
        url,
        ...asRegulator()
      })
      return cellsOf(await workbookIn(response))
    }

    /**
     * @param {typeof register} params
     * @param {boolean} redacted
     */
    const built = async (params, redacted) =>
      cellsOf(
        await reread(await buildMarketInsightsWorkbook({ ...params, redacted }))
      )

    it('serves the redacted workbook built from that register, taken when requested', async () => {
      const redacted = await built(register, true)

      expect(redacted).not.toEqual(
        await built(readParamsFor(JANUARY_TO_MARCH), true)
      )
      expect(redacted).not.toEqual(await built(register, false))
      expect(await download(MARCH)).toEqual(redacted)
    })

    it('serves the full workbook built from that register when asked for it unredacted', async () => {
      expect(await download(`${MARCH}?unredacted=true`)).toEqual(
        await built(register, false)
      )
    })

    it('serves the redacted workbook when asked for it not unredacted', async () => {
      expect(await download(`${MARCH}?unredacted=false`)).toEqual(
        await built(register, true)
      )
    })
  })
})

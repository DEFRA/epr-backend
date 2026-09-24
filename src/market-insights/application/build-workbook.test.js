import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import {
  JANUARY_TO_JUNE_2026,
  readParamsFor,
  readPublishedWorkbook,
  reread,
  sheet
} from './workbook/published-workbook-test-helpers.js'
import { buildMarketInsightsWorkbook } from './build-workbook.js'

/** @import ExcelJS from 'exceljs' */

describe('building the published market insights workbook', () => {
  /** @type {ExcelJS.Workbook} */
  let generated

  beforeAll(async () => {
    generated = await reread(
      await buildMarketInsightsWorkbook(readParamsFor(JANUARY_TO_JUNE_2026))
    )
  })

  it('has the published tabs, in the published order, trailing spaces and all', async () => {
    const published = await readPublishedWorkbook()

    expect(generated.worksheets.map(({ name }) => name)).toEqual(
      published.worksheets.map(({ name }) => name)
    )
  })

  it('lays every tab out for the requested period', () => {
    expect(
      sheet(generated, WORKSHEET_NAME.WASTE_BALANCE).getCell('A5').value
    ).toBe(
      'The table below shows the UK credited waste balance for January to June 2026'
    )
  })
})

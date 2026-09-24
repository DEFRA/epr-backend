import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import { addKey } from './key-tab.js'
import {
  itMatchesThePublishedTab,
  readPublishedWorkbook,
  renderTab,
  sheet
} from './published-workbook-test-helpers.js'

/** @import ExcelJS from 'exceljs' */

const KEY_COLUMNS = ['A', 'B', 'C', 'D', 'E']

/**
 * @param {ExcelJS.Worksheet} worksheet
 */
const widthsOf = (worksheet) =>
  KEY_COLUMNS.map((column) => worksheet.getColumn(column).width?.toFixed(2))

describe('the Key tab', () => {
  itMatchesThePublishedTab(WORKSHEET_NAME.KEY, () => renderTab(addKey))

  it('sets its columns to the published widths', async () => {
    const published = sheet(await readPublishedWorkbook(), WORKSHEET_NAME.KEY)

    expect(widthsOf(await renderTab(addKey))).toEqual(widthsOf(published))
  })
})

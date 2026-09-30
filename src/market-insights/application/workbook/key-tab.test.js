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

/**
 * @param {boolean} redacted
 */
const renderKey = (redacted) =>
  renderTab((workbook) => addKey(workbook, { redacted }))

describe('the Key tab', () => {
  itMatchesThePublishedTab(WORKSHEET_NAME.KEY, () => renderKey(false))

  it('sets its columns to the published widths', async () => {
    const published = sheet(await readPublishedWorkbook(), WORKSHEET_NAME.KEY)

    expect(widthsOf(await renderKey(false))).toEqual(widthsOf(published))
  })
})

describe('the Key tab of a redacted workbook', () => {
  it('says what "[c]" means, after the published tables', async () => {
    const full = await renderKey(false)
    const redacted = await renderKey(true)
    const row = redacted.getRow(redacted.rowCount)

    expect(redacted.rowCount).toBeGreaterThan(full.rowCount)
    expect(row.getCell('A').value).toBe('[c]')
    expect(row.getCell('B').value).toBe(
      'Confidential. This figure is withheld to protect confidentiality.'
    )
  })
})

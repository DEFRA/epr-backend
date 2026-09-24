import ExcelJS from 'exceljs'

import { readMarketInsightsFigures } from '#market-insights/application/read-figures.js'
import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import { frameOf } from './workbook/cells.js'
import { addKey } from './workbook/key-tab.js'
import { addNationFigures } from './workbook/nation-figures-tab.js'
import { addOutstandingReturns } from './workbook/outstanding-returns-tab.js'
import { addWasteBalance } from './workbook/waste-balance-tab.js'

/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { MarketInsightsFigures, ReadMarketInsightsFiguresParams } from '#market-insights/application/read-figures.js' */

/**
 * @typedef {Object} WorkbookContents
 * @property {MarketInsightsFigures} figures
 * @property {YearMonth[]} months
 * @property {Date} now - when the figures were taken
 */

/**
 * @param {WorkbookContents} contents
 * @returns {ExcelJS.Workbook}
 */
const renderWorkbook = ({ figures, months, now }) => {
  const contents = { ...frameOf({ months, now }), figures }
  const workbook = new ExcelJS.Workbook()
  addWasteBalance(workbook, contents)
  addKey(workbook)
  addOutstandingReturns(workbook, contents)
  addNationFigures(workbook, WORKSHEET_NAME.UK, contents)
  addNationFigures(workbook, WORKSHEET_NAME.ENGLAND, contents)
  return workbook
}

/**
 * The published market insights workbook, "UK Accredited Packaging Waste
 * Monthly Aggregated Data", laid out and styled as the regulators publish it.
 *
 * It reads its figures with the same function the export archive uses, so
 * every tab is taken from one reading of the register.
 *
 * @param {ReadMarketInsightsFiguresParams} params
 * @returns {Promise<ExcelJS.Workbook>}
 */
export const buildMarketInsightsWorkbook = async (params) =>
  renderWorkbook({
    ...params,
    figures: await readMarketInsightsFigures(params)
  })

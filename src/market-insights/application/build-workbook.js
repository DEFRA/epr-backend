import ExcelJS from 'exceljs'

import { UK_TIME_ZONE } from '#common/helpers/dates/uk-time-zone.js'
import { readMarketInsightsFigures } from '#market-insights/application/read-figures.js'
import {
  dataAsOf,
  GRAND_TOTAL,
  KEY_ROWS,
  NATION_FIGURES_MATERIALS,
  NATION_FIGURES_NOTE,
  NATION_FIGURES_TABLES,
  OUTSTANDING_RETURNS_INTRODUCTION_SUFFIX,
  OUTSTANDING_RETURNS_MATERIALS,
  OUTSTANDING_RETURNS_NOTE,
  outstandingReturnsIntroduction,
  TONNAGE_BANDS,
  UNSUBMITTED_COUNT,
  WASTE_BALANCE_COLUMNS,
  WASTE_BALANCE_NOTE,
  WASTE_BALANCE_ROWS,
  wasteBalanceIntroduction,
  WORKSHEET_NAME
} from '#market-insights/domain/published-workbook-text.js'

/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { MarketInsightsFigures, ReadMarketInsightsFiguresParams } from '#market-insights/application/read-figures.js' */
/** @import { Note } from '#market-insights/domain/published-workbook-text.js' */

const monthName = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  timeZone: 'UTC'
})
const monthAndYear = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
})
const extractionDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: UK_TIME_ZONE
})

/**
 * @param {YearMonth} yearMonth
 * @returns {Date}
 */
const firstDayOf = (yearMonth) => new Date(`${yearMonth}-01T00:00:00.000Z`)

/**
 * The reporting period as the published wording names it: 'January to June
 * 2026', or 'January 2026' when it is one month.
 *
 * @param {YearMonth[]} months
 * @returns {string}
 */
const periodOf = (months) => {
  const [first, ...rest] = months.map(firstDayOf)
  const last = rest.at(-1)
  return last
    ? `${monthName.format(first)} to ${monthAndYear.format(last)}`
    : monthAndYear.format(first)
}

/**
 * @param {Note} note
 * @returns {ExcelJS.CellRichTextValue}
 */
const richNote = ({ lead, body }) => ({
  richText: [
    { font: { bold: true, italic: true }, text: lead },
    { font: { italic: true }, text: body }
  ]
})

/**
 * @param {ExcelJS.Worksheet} worksheet
 * @param {number} row
 * @param {readonly (string | Date)[]} values - written from column A onwards
 */
const writeRow = (worksheet, row, values) => {
  values.forEach((value, index) => {
    worksheet.getCell(row, index + 1).value = value
  })
}

/**
 * @param {ExcelJS.Worksheet} worksheet
 * @param {number} firstRow
 * @param {readonly string[]} labels - written down column A
 */
const writeColumn = (worksheet, firstRow, labels) => {
  labels.forEach((label, index) => {
    worksheet.getCell(firstRow + index, 1).value = label
  })
}

/**
 * @typedef {Object} Frame
 * @property {YearMonth[]} months
 * @property {string} period
 * @property {string} asOf
 */

const WASTE_BALANCE_HEADING_ROW = 9

/**
 * @param {ExcelJS.Workbook} workbook
 * @param {Frame} frame
 */
const addWasteBalance = (workbook, { months, period, asOf }) => {
  const worksheet = workbook.addWorksheet(WORKSHEET_NAME.WASTE_BALANCE)
  worksheet.mergeCells('A1:M3')
  worksheet.getCell('A1').value = richNote(WASTE_BALANCE_NOTE)
  worksheet.getCell('A5').value = wasteBalanceIntroduction(period)
  worksheet.getCell('A7').value = asOf

  writeRow(worksheet, WASTE_BALANCE_HEADING_ROW, [
    ...WASTE_BALANCE_COLUMNS.before,
    ...months.map(firstDayOf),
    ...WASTE_BALANCE_COLUMNS.after
  ])
  months.forEach((_, index) => {
    worksheet.getCell(
      WASTE_BALANCE_HEADING_ROW,
      WASTE_BALANCE_COLUMNS.before.length + index + 1
    ).numFmt = 'mmm-yy'
  })
  WASTE_BALANCE_ROWS.forEach((labels, index) => {
    writeRow(worksheet, WASTE_BALANCE_HEADING_ROW + 1 + index, labels)
  })
}

/** Columns A, B, D and E: the Key's two halves, with C between them. */
const KEY_COLUMNS = [1, 2, 4, 5]

/**
 * @param {ExcelJS.Workbook} workbook
 */
const addKey = (workbook) => {
  const worksheet = workbook.addWorksheet(WORKSHEET_NAME.KEY)
  for (const [row, cells] of KEY_ROWS) {
    cells.forEach((text, index) => {
      if (text !== null) {
        worksheet.getCell(row, KEY_COLUMNS[index]).value = text
      }
    })
  }
  for (const range of ['A4:B4', 'D4:E4', 'A18:B18', 'D18:E18']) {
    worksheet.mergeCells(range)
  }
}

const OUTSTANDING_RETURNS_FIRST_ROW = 7
// A month title, the headings, a row per band, then a blank row.
const OUTSTANDING_RETURNS_BLOCK_ROWS = 2 + TONNAGE_BANDS.length + 1
// A label, a count, then a blank column.
const OUTSTANDING_RETURNS_MONTH_COLUMNS = 3

/**
 * One block per material, running down the tab, with each month's table
 * alongside the last.
 *
 * @param {ExcelJS.Workbook} workbook
 * @param {Frame} frame
 */
const addOutstandingReturns = (workbook, { months, period, asOf }) => {
  const worksheet = workbook.addWorksheet(WORKSHEET_NAME.OUTSTANDING_RETURNS)
  worksheet.mergeCells('A1:M1')
  worksheet.getCell('A1').value = richNote(OUTSTANDING_RETURNS_NOTE)
  worksheet.getCell('A3').value = {
    richText: [
      { text: outstandingReturnsIntroduction(period) },
      {
        font: { bold: true, italic: true },
        text: OUTSTANDING_RETURNS_INTRODUCTION_SUFFIX
      }
    ]
  }
  worksheet.getCell('A5').value = asOf

  OUTSTANDING_RETURNS_MATERIALS.forEach((material, materialIndex) => {
    const top =
      OUTSTANDING_RETURNS_FIRST_ROW +
      OUTSTANDING_RETURNS_BLOCK_ROWS * materialIndex
    months.forEach((month, monthIndex) => {
      const column = 1 + OUTSTANDING_RETURNS_MONTH_COLUMNS * monthIndex
      worksheet.mergeCells(top, column, top, column + 1)
      worksheet.getCell(top, column).value = monthName.format(firstDayOf(month))
      worksheet.getCell(top + 1, column).value = material
      worksheet.getCell(top + 1, column + 1).value = UNSUBMITTED_COUNT
      TONNAGE_BANDS.forEach((band, bandIndex) => {
        worksheet.getCell(top + 2 + bandIndex, column).value = band
      })
    })
  })
}

const NATION_FIGURES_FIRST_ROW = 2
// A title, the headings, a row per material, the grand total, then a blank row.
const NATION_FIGURES_TABLE_ROWS = 2 + NATION_FIGURES_MATERIALS.length + 1 + 1
// A month title over two tables.
const NATION_FIGURES_SECTION_ROWS = 1 + 2 * NATION_FIGURES_TABLE_ROWS
const NATION_FIGURES_WIDTH = Math.max(
  ...Object.values(NATION_FIGURES_TABLES).map(({ columns }) => columns.length)
)

/**
 * Every month's tonnage tables, then every month's PRN and PERN tables, each
 * month a section of two tables under the month's name.
 *
 * @param {ExcelJS.Workbook} workbook
 * @param {string} name
 * @param {Frame} frame
 */
const addNationFigures = (workbook, name, { months }) => {
  const worksheet = workbook.addWorksheet(name)
  worksheet.mergeCells(1, 1, 1, NATION_FIGURES_WIDTH)
  worksheet.getCell('A1').value = richNote(NATION_FIGURES_NOTE)

  const { reprocessor, exporter, reprocessorPrn, exporterPern } =
    NATION_FIGURES_TABLES
  const sections = [
    ...months.map((month) => ({ month, tables: [reprocessor, exporter] })),
    ...months.map((month) => ({
      month,
      tables: [reprocessorPrn, exporterPern]
    }))
  ]

  sections.forEach(({ month, tables }, sectionIndex) => {
    const top =
      NATION_FIGURES_FIRST_ROW + NATION_FIGURES_SECTION_ROWS * sectionIndex
    worksheet.mergeCells(top, 1, top, NATION_FIGURES_WIDTH)
    worksheet.getCell(top, 1).value = monthAndYear.format(firstDayOf(month))

    tables.forEach(({ title, columns }, tableIndex) => {
      const tableTop = top + 1 + NATION_FIGURES_TABLE_ROWS * tableIndex
      worksheet.getCell(tableTop, 1).value = title
      writeRow(worksheet, tableTop + 1, columns)
      writeColumn(worksheet, tableTop + 2, [
        ...NATION_FIGURES_MATERIALS,
        GRAND_TOTAL
      ])
    })
  })
}

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
const renderWorkbook = ({ months, now }) => {
  const frame = {
    months,
    period: periodOf(months),
    asOf: dataAsOf(extractionDate.format(now))
  }
  const workbook = new ExcelJS.Workbook()
  addWasteBalance(workbook, frame)
  addKey(workbook)
  addOutstandingReturns(workbook, frame)
  addNationFigures(workbook, WORKSHEET_NAME.UK, frame)
  addNationFigures(workbook, WORKSHEET_NAME.ENGLAND, frame)
  return workbook
}

/**
 * The published market insights workbook, "UK Accredited Packaging Waste
 * Monthly Aggregated Data", laid out as the regulators publish it.
 *
 * Its figures come from the same one read of the register that the export
 * archive takes, so every tab agrees with every other and with the archive.
 *
 * @param {ReadMarketInsightsFiguresParams} params
 * @returns {Promise<ExcelJS.Workbook>}
 */
export const buildMarketInsightsWorkbook = async (params) =>
  renderWorkbook({
    ...params,
    figures: await readMarketInsightsFigures(params)
  })

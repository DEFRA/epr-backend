import ExcelJS from 'exceljs'

import { UK_TIME_ZONE } from '#common/helpers/dates/uk-time-zone.js'
import { readMarketInsightsFigures } from '#market-insights/application/read-figures.js'
import {
  BAND,
  COLUMN_WIDTHS,
  COUNT,
  DATA_AS_OF,
  FIGURE,
  GRAND_TOTAL_FIGURE,
  GRAND_TOTAL_LABEL,
  INTRODUCTION,
  KEY_DESCRIPTION,
  KEY_FIELD,
  KEY_HEADING,
  KEY_INTRODUCTION,
  KEY_ROW_HEIGHTS,
  LABEL,
  NATION_FIGURES_HEADING,
  NATION_FIGURES_MONTH,
  NATION_FIGURES_TITLE,
  NOTE,
  OUTSTANDING_RETURNS_HEADING,
  OUTSTANDING_RETURNS_MONTH,
  ROW_HEIGHT,
  TONNAGE_BAND,
  WASTE_BALANCE_HEADING,
  WASTE_BALANCE_MONTH_HEADING
} from '#market-insights/domain/published-workbook-style.js'
import {
  dataAsOf,
  GRAND_TOTAL,
  KEY,
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
  WASTE_BALANCE_GUIDANCE,
  WASTE_BALANCE_NOTE,
  WASTE_BALANCE_ROWS,
  wasteBalanceIntroduction,
  WORKSHEET_NAME
} from '#market-insights/domain/published-workbook-text.js'

/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { MarketInsightsFigures, ReadMarketInsightsFiguresParams } from '#market-insights/application/read-figures.js' */
/** @import { KeyRow, Note } from '#market-insights/domain/published-workbook-text.js' */

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
    { font: { ...NOTE.font, bold: true }, text: lead },
    { font: NOTE.font, text: body }
  ]
})

/**
 * @param {ExcelJS.Cell} cell
 * @param {ExcelJS.CellValue} value
 * @param {Partial<ExcelJS.Style>} style
 */
const write = (cell, value, style) => {
  cell.value = value
  cell.style = { ...style }
}

/**
 * @param {ExcelJS.Worksheet} worksheet
 * @param {number} row
 * @param {number} firstColumn
 * @param {readonly (string | Date | null)[]} values - written rightwards
 * @param {Partial<ExcelJS.Style>} style
 */
const writeRow = (worksheet, row, firstColumn, values, style) => {
  values.forEach((value, index) => {
    write(worksheet.getCell(row, firstColumn + index), value, style)
  })
}

/**
 * Styles cells that hold no text: the bands, and the figure cells, ready for
 * their figures.
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @param {number} row
 * @param {number} firstColumn
 * @param {number} count
 * @param {Partial<ExcelJS.Style>} style
 */
const styleEmptyCells = (worksheet, row, firstColumn, count, style) => {
  const empty = Array.from({ length: count }, () => null)
  writeRow(worksheet, row, firstColumn, empty, style)
}

/**
 * @param {ExcelJS.Worksheet} worksheet
 * @param {Readonly<Record<string, number>>} widths - in column order
 * @param {number} [firstColumn]
 */
const setWidths = (worksheet, widths, firstColumn = 1) => {
  Object.values(widths).forEach((width, index) => {
    worksheet.getColumn(firstColumn + index).width = width
  })
}

/**
 * @typedef {Object} Frame
 * @property {YearMonth[]} months
 * @property {string} period
 * @property {string} asOf
 */

const WASTE_BALANCE_NOTE_LAST_ROW = 3
const WASTE_BALANCE_BAND_ROW = WASTE_BALANCE_NOTE_LAST_ROW + 1
const WASTE_BALANCE_HEADING_ROW = 9

/**
 * @param {ExcelJS.Workbook} workbook
 * @param {Frame} frame
 */
const addWasteBalance = (workbook, { months, period, asOf }) => {
  const worksheet = workbook.addWorksheet(WORKSHEET_NAME.WASTE_BALANCE)
  setWidths(worksheet, COLUMN_WIDTHS.WASTE_BALANCE)

  const { lead, body } = WASTE_BALANCE_NOTE
  write(
    worksheet.getCell('A1'),
    { text: `${lead}${body}`, hyperlink: WASTE_BALANCE_GUIDANCE },
    NOTE
  )
  worksheet.mergeCells(`A1:M${WASTE_BALANCE_NOTE_LAST_ROW}`)
  worksheet.getRow(WASTE_BALANCE_NOTE_LAST_ROW).height =
    ROW_HEIGHT.WASTE_BALANCE_NOTE
  write(worksheet.getCell(`A${WASTE_BALANCE_BAND_ROW}`), null, BAND)
  worksheet.mergeCells(`A${WASTE_BALANCE_BAND_ROW}:M${WASTE_BALANCE_BAND_ROW}`)
  worksheet.getRow(WASTE_BALANCE_BAND_ROW).height =
    ROW_HEIGHT.WASTE_BALANCE_BAND
  write(worksheet.getCell('A5'), wasteBalanceIntroduction(period), INTRODUCTION)
  write(worksheet.getCell('A7'), asOf, DATA_AS_OF)

  const { before, after } = WASTE_BALANCE_COLUMNS
  writeRow(
    worksheet,
    WASTE_BALANCE_HEADING_ROW,
    1,
    before,
    WASTE_BALANCE_HEADING
  )
  writeRow(
    worksheet,
    WASTE_BALANCE_HEADING_ROW,
    before.length + 1,
    [...months.map(firstDayOf), ...after],
    WASTE_BALANCE_MONTH_HEADING
  )
  worksheet.getRow(WASTE_BALANCE_HEADING_ROW).height =
    ROW_HEIGHT.WASTE_BALANCE_HEADINGS

  WASTE_BALANCE_ROWS.forEach((labels, index) => {
    const row = WASTE_BALANCE_HEADING_ROW + 1 + index
    writeRow(worksheet, row, 1, labels, LABEL)
    styleEmptyCells(
      worksheet,
      row,
      labels.length + 1,
      months.length + after.length,
      FIGURE
    )
  })
}

/** The Key's two halves, with column C between them. */
const KEY_COLUMNS = ['A', 'B', 'D', 'E']
const KEY_INTRODUCTION_ROW = 2
const KEY_FIRST_TABLE_ROW = 4

/**
 * @param {ExcelJS.Worksheet} worksheet
 * @param {number} row
 * @param {readonly (string | null)[]} cells - in the Key's columns
 */
const writeKeyHeadings = (worksheet, row, cells) => {
  KEY_COLUMNS.forEach((column, index) => {
    write(worksheet.getCell(`${column}${row}`), cells[index], KEY_HEADING)
  })
}

/**
 * @param {ExcelJS.Worksheet} worksheet
 * @param {number} row
 * @param {KeyRow} cells
 */
const writeKeyFields = (worksheet, row, cells) => {
  KEY_COLUMNS.forEach((column, index) => {
    const text = cells[index]
    if (text !== null) {
      const style = index % 2 === 0 ? KEY_FIELD : KEY_DESCRIPTION
      write(worksheet.getCell(`${column}${row}`), text, style)
    }
  })
}

/**
 * @param {ExcelJS.Workbook} workbook
 */
const addKey = (workbook) => {
  const worksheet = workbook.addWorksheet(WORKSHEET_NAME.KEY)
  setWidths(worksheet, COLUMN_WIDTHS.KEY)
  for (const [row, height] of Object.entries(KEY_ROW_HEIGHTS)) {
    worksheet.getRow(Number(row)).height = height
  }

  write(
    worksheet.getCell(`A${KEY_INTRODUCTION_ROW}`),
    KEY.introduction,
    KEY_INTRODUCTION
  )
  let row = KEY_FIRST_TABLE_ROW
  KEY.tables.forEach((fields, index) => {
    if (index > 0) {
      write(worksheet.getCell(`A${row}`), null, BAND)
      worksheet.mergeCells(`A${row}:E${row}`)
      row += 1
    }
    writeKeyHeadings(worksheet, row, KEY.title)
    worksheet.mergeCells(`A${row}:B${row}`)
    worksheet.mergeCells(`D${row}:E${row}`)
    writeKeyHeadings(worksheet, row + 1, KEY.headings)
    fields.forEach((cells, offset) => {
      writeKeyFields(worksheet, row + 2 + offset, cells)
    })
    row += 2 + fields.length
  })
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
  months.forEach((_, index) => {
    setWidths(
      worksheet,
      COLUMN_WIDTHS.OUTSTANDING_RETURNS_MONTH,
      1 + OUTSTANDING_RETURNS_MONTH_COLUMNS * index
    )
  })

  write(worksheet.getCell('A1'), richNote(OUTSTANDING_RETURNS_NOTE), NOTE)
  worksheet.mergeCells('A1:M1')
  worksheet.getRow(1).height = ROW_HEIGHT.OUTSTANDING_RETURNS_NOTE
  styleEmptyCells(
    worksheet,
    2,
    1,
    OUTSTANDING_RETURNS_MONTH_COLUMNS * months.length - 1,
    BAND
  )
  worksheet.getRow(2).height = ROW_HEIGHT.OUTSTANDING_RETURNS_BAND
  write(
    worksheet.getCell('A3'),
    {
      richText: [
        { text: outstandingReturnsIntroduction(period) },
        {
          font: { ...INTRODUCTION.font, italic: true },
          text: OUTSTANDING_RETURNS_INTRODUCTION_SUFFIX
        }
      ]
    },
    INTRODUCTION
  )
  write(worksheet.getCell('A5'), asOf, DATA_AS_OF)

  OUTSTANDING_RETURNS_MATERIALS.forEach((material, materialIndex) => {
    const top =
      OUTSTANDING_RETURNS_FIRST_ROW +
      OUTSTANDING_RETURNS_BLOCK_ROWS * materialIndex
    worksheet.getRow(top).height = ROW_HEIGHT.OUTSTANDING_RETURNS_MONTH
    for (let row = top + 1; row < top + 2 + TONNAGE_BANDS.length; row++) {
      worksheet.getRow(row).height = ROW_HEIGHT.OUTSTANDING_RETURNS_ROW
    }

    months.forEach((month, monthIndex) => {
      const column = 1 + OUTSTANDING_RETURNS_MONTH_COLUMNS * monthIndex
      write(
        worksheet.getCell(top, column),
        monthName.format(firstDayOf(month)),
        OUTSTANDING_RETURNS_MONTH
      )
      worksheet.mergeCells(top, column, top, column + 1)
      writeRow(
        worksheet,
        top + 1,
        column,
        [material, UNSUBMITTED_COUNT],
        OUTSTANDING_RETURNS_HEADING
      )
      TONNAGE_BANDS.forEach((band, bandIndex) => {
        const row = top + 2 + bandIndex
        write(worksheet.getCell(row, column), band, TONNAGE_BAND)
        styleEmptyCells(worksheet, row, column + 1, 1, COUNT)
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
  setWidths(worksheet, COLUMN_WIDTHS.NATION_FIGURES)
  write(worksheet.getCell('A1'), richNote(NATION_FIGURES_NOTE), NOTE)
  worksheet.mergeCells(1, 1, 1, NATION_FIGURES_WIDTH)
  worksheet.getRow(1).height = ROW_HEIGHT.NATION_FIGURES_NOTE

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
    write(
      worksheet.getCell(top, 1),
      monthAndYear.format(firstDayOf(month)),
      NATION_FIGURES_MONTH
    )
    worksheet.mergeCells(top, 1, top, NATION_FIGURES_WIDTH)

    tables.forEach(({ title, columns }, tableIndex) => {
      const tableTop = top + 1 + NATION_FIGURES_TABLE_ROWS * tableIndex
      const figureCount = columns.length - 1
      write(worksheet.getCell(tableTop, 1), title, NATION_FIGURES_TITLE)
      writeRow(worksheet, tableTop + 1, 1, columns, NATION_FIGURES_HEADING)
      worksheet.getRow(tableTop + 1).height = ROW_HEIGHT.NATION_FIGURES_HEADINGS
      NATION_FIGURES_MATERIALS.forEach((material, materialIndex) => {
        const row = tableTop + 2 + materialIndex
        write(worksheet.getCell(row, 1), material, LABEL)
        styleEmptyCells(worksheet, row, 2, figureCount, FIGURE)
      })
      const totalRow = tableTop + 2 + NATION_FIGURES_MATERIALS.length
      write(worksheet.getCell(totalRow, 1), GRAND_TOTAL, GRAND_TOTAL_LABEL)
      styleEmptyCells(worksheet, totalRow, 2, figureCount, GRAND_TOTAL_FIGURE)
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

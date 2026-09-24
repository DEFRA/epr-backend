import {
  COLUMN_WIDTHS,
  FIGURE,
  GRAND_TOTAL_FIGURE,
  GRAND_TOTAL_LABEL,
  LABEL,
  NATION_FIGURES_HEADING,
  NATION_FIGURES_MONTH,
  NATION_FIGURES_TITLE,
  NOTE,
  ROW_HEIGHT
} from '#market-insights/domain/published-workbook-style.js'
import {
  GRAND_TOTAL,
  NATION_FIGURES_MATERIALS,
  NATION_FIGURES_NOTE,
  NATION_FIGURES_TABLES
} from '#market-insights/domain/published-workbook-text.js'
import {
  firstDayOf,
  monthAndYear,
  richNote,
  setWidths,
  styleEmptyCells,
  write,
  writeRow
} from './cells.js'

/** @import ExcelJS from 'exceljs' */
/** @import { Frame } from './cells.js' */

const NATION_FIGURES_FIRST_ROW = 2
// A title, the headings, a row per material, the grand total, then a blank row.
const NATION_FIGURES_TABLE_ROWS = 2 + NATION_FIGURES_MATERIALS.length + 1 + 1
// A month title over two tables.
const NATION_FIGURES_SECTION_ROWS = 1 + 2 * NATION_FIGURES_TABLE_ROWS
const NATION_FIGURES_WIDTH = Math.max(
  ...Object.values(NATION_FIGURES_TABLES).map(({ columns }) => columns.length)
)

/**
 * A UK or England tab: every month's tonnage tables, then every month's PRN
 * and PERN tables, each month a section of two tables under the month's name.
 *
 * @param {ExcelJS.Workbook} workbook
 * @param {string} name
 * @param {Frame} frame
 */
export const addNationFigures = (workbook, name, { months }) => {
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

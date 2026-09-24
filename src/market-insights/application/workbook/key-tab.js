import {
  BAND,
  COLUMN_WIDTHS,
  KEY_DESCRIPTION,
  KEY_FIELD,
  KEY_HEADING,
  KEY_INTRODUCTION,
  KEY_ROW_HEIGHTS
} from '#market-insights/domain/published-workbook-style.js'
import {
  KEY,
  WORKSHEET_NAME
} from '#market-insights/domain/published-workbook-text.js'
import { setWidths, write } from './cells.js'

/** @import ExcelJS from 'exceljs' */
/** @import { KeyRow } from '#market-insights/domain/published-workbook-text.js' */

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
export const addKey = (workbook) => {
  const worksheet = workbook.addWorksheet(WORKSHEET_NAME.KEY)
  setWidths(worksheet, COLUMN_WIDTHS.KEY)
  for (const [number, height] of Object.entries(KEY_ROW_HEIGHTS)) {
    worksheet.getRow(Number(number)).height = height
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

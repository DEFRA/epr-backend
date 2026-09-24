import {
  BAND,
  COLUMN_WIDTHS,
  DATA_AS_OF,
  FIGURE,
  INTRODUCTION,
  LABEL,
  NOTE,
  ROW_HEIGHT,
  WASTE_BALANCE_HEADING,
  WASTE_BALANCE_MONTH_HEADING
} from '#market-insights/domain/published-workbook-style.js'
import {
  WASTE_BALANCE_COLUMNS,
  WASTE_BALANCE_GUIDANCE,
  WASTE_BALANCE_NOTE,
  WASTE_BALANCE_ROWS,
  wasteBalanceIntroduction,
  WORKSHEET_NAME
} from '#market-insights/domain/published-workbook-text.js'
import {
  firstDayOf,
  setWidths,
  styleEmptyCells,
  write,
  writeRow
} from './cells.js'

/** @import ExcelJS from 'exceljs' */
/** @import { TabContents } from './cells.js' */

const WASTE_BALANCE_NOTE_LAST_ROW = 3
const WASTE_BALANCE_BAND_ROW = WASTE_BALANCE_NOTE_LAST_ROW + 1
const WASTE_BALANCE_HEADING_ROW = 9

/**
 * @param {ExcelJS.Workbook} workbook
 * @param {TabContents} contents
 */
export const addWasteBalance = (workbook, { months, period, asOf }) => {
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

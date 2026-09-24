import {
  BAND,
  COLUMN_WIDTHS,
  COUNT,
  DATA_AS_OF,
  INTRODUCTION,
  NOTE,
  OUTSTANDING_RETURNS_HEADING,
  OUTSTANDING_RETURNS_MONTH,
  ROW_HEIGHT,
  TONNAGE_BAND
} from '#market-insights/domain/published-workbook-style.js'
import {
  OUTSTANDING_RETURNS_INTRODUCTION_SUFFIX,
  OUTSTANDING_RETURNS_MATERIALS,
  OUTSTANDING_RETURNS_NOTE,
  outstandingReturnsIntroduction,
  TONNAGE_BANDS,
  UNSUBMITTED_COUNT,
  WORKSHEET_NAME
} from '#market-insights/domain/published-workbook-text.js'
import {
  firstDayOf,
  monthName,
  richNote,
  setWidths,
  styleEmptyCells,
  write,
  writeRow
} from './cells.js'

/** @import ExcelJS from 'exceljs' */
/** @import { TabContents } from './cells.js' */

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
 * @param {TabContents} contents
 */
export const addOutstandingReturns = (workbook, { months, period, asOf }) => {
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

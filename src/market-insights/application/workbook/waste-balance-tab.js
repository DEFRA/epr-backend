import {
  CONFIDENTIAL,
  fromFewOperators
} from '#market-insights/domain/confidential-figures.js'
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
  WASTE_BALANCE_ROWS,
  WASTE_BALANCE_COLUMNS,
  WASTE_BALANCE_GUIDANCE,
  WASTE_BALANCE_MATERIALS,
  WASTE_BALANCE_NOTE,
  wasteBalanceIntroduction,
  WORKSHEET_NAME
} from '#market-insights/domain/published-workbook-text.js'
import {
  firstDayOf,
  hasAccreditedOperator,
  setWidths,
  tableOf,
  UK_SCOPE,
  write,
  writeFigure,
  writeRow
} from './cells.js'

/** @import ExcelJS from 'exceljs' */
/** @import { OperatorCounts } from '#market-insights/application/operator-counts.js' */
/** @import { WasteBalanceRowType } from '#market-insights/domain/waste-balance-figures.js' */
/** @import { RedactableTabContents } from './cells.js' */

const WASTE_BALANCE_NOTE_LAST_ROW = 3
const WASTE_BALANCE_BAND_ROW = WASTE_BALANCE_NOTE_LAST_ROW + 1
const WASTE_BALANCE_HEADING_ROW = 9

/**
 * A row of the waste balance: its material and accreditation type, then its
 * net credit for each month and for the period.
 *
 * @typedef {{ labels: readonly [string, string], netCredits: (number | string)[] }} WasteBalanceRow
 */

/**
 * A net credit as published: "[c]" where redacted and too few operators were
 * accredited for it. Each month's and the period's net credit is judged on its
 * own operators, as the regulator pages mark them.
 *
 * @param {number} netCredit
 * @param {OperatorCounts} counts
 * @param {boolean} redacted
 * @returns {number | string}
 */
const publishedNetCredit = (netCredit, counts, redacted) =>
  redacted && fromFewOperators(counts, netCredit !== 0)
    ? CONFIDENTIAL
    : netCredit

/**
 * @template T
 * @param {Partial<Record<WasteBalanceRowType, T>>} byRow
 * @param {WasteBalanceRowType} row - one the material is served as
 * @returns {T}
 */
const servedRow = (byRow, row) => /** @type {T} */ (byRow[row])

/**
 * A row for each row served of each material the period has an accredited
 * operator for: its exporters and reprocessors, or the one row merging them.
 * Each holds every month's net credit as served, then the period's.
 *
 * @param {ExcelJS.Workbook} workbook
 * @param {RedactableTabContents} contents
 */
export const addWasteBalance = (
  workbook,
  { months, period, asOf, figures, redacted }
) => {
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

  const ukTable = tableOf(figures.scopes, UK_SCOPE)
  const served = figures.wasteBalance.data
  /** @type {WasteBalanceRow[]} */
  const rows = WASTE_BALANCE_MATERIALS.filter(([material]) =>
    hasAccreditedOperator(ukTable, material)
  ).flatMap(([material, materialLabel]) =>
    WASTE_BALANCE_ROWS.filter(
      ([type]) => type in served.period.figures[material]
    ).map(([type, typeLabel]) => ({
      labels: [materialLabel, typeLabel],
      netCredits: [
        ...months.map((month) => {
          const figure = servedRow(served.months[month].figures[material], type)
          return publishedNetCredit(figure.netCredit, figure, redacted)
        }),
        publishedNetCredit(
          servedRow(served.period.figures[material], type).netCredit,
          servedRow(served.period.operatorCounts[material], type),
          redacted
        )
      ]
    }))
  )

  rows.forEach(({ labels, netCredits }, index) => {
    const row = WASTE_BALANCE_HEADING_ROW + 1 + index
    writeRow(worksheet, row, 1, labels, LABEL)
    netCredits.forEach((netCredit, column) => {
      writeFigure(
        worksheet.getCell(row, labels.length + 1 + column),
        netCredit,
        FIGURE
      )
    })
  })
}

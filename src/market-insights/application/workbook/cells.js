import { UK_TIME_ZONE } from '#common/helpers/dates/uk-time-zone.js'
import { CONFIDENTIAL } from '#market-insights/domain/confidential-figures.js'
import {
  NOTE,
  WHOLE_TONNES
} from '#market-insights/domain/published-workbook-style.js'
import { dataAsOf } from '#market-insights/domain/published-workbook-text.js'

/** @import ExcelJS from 'exceljs' */
/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { Material } from '#domain/organisations/model.js' */
/** @import { MarketInsightsFigures, ScopeFigures } from '#market-insights/application/read-figures.js' */
/** @import { ReprocessorExporterTable } from '#market-insights/application/reprocessor-exporter-table.js' */
/** @import { Note } from '#market-insights/domain/published-workbook-text.js' */

export const monthName = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  timeZone: 'UTC'
})
export const monthAndYear = new Intl.DateTimeFormat('en-GB', {
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
export const firstDayOf = (yearMonth) =>
  new Date(`${yearMonth}-01T00:00:00.000Z`)

/**
 * What every tab is laid out for: the months it covers, the reporting period
 * as the published wording names it, and when the figures were taken.
 *
 * @typedef {Object} Frame
 * @property {YearMonth[]} months
 * @property {string} period - 'January to June 2026', or 'January 2026' for one month
 * @property {string} asOf
 */

/**
 * What a tab that carries figures is given: its frame, and the one reading of
 * the register that every tab is filled from.
 *
 * @typedef {Frame & { figures: MarketInsightsFigures }} TabContents
 */

/**
 * What a tab of published figures is given: its contents, and whether it
 * shows a figure from too few operators as "[c]" instead of its value.
 *
 * @typedef {TabContents & { redacted: boolean }} RedactableTabContents
 */

/**
 * @param {{ months: YearMonth[], now: Date }} params - now is when the figures were taken
 * @returns {Frame}
 */
export const frameOf = ({ months, now }) => {
  const [first, ...rest] = months.map(firstDayOf)
  const last = rest.at(-1)
  return {
    months,
    period: last
      ? `${monthName.format(first)} to ${monthAndYear.format(last)}`
      : monthAndYear.format(first),
    asOf: dataAsOf(extractionDate.format(now))
  }
}

/**
 * @param {Note} note
 * @returns {ExcelJS.CellRichTextValue}
 */
export const richNote = ({ lead, body }) => ({
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
export const write = (cell, value, style) => {
  cell.value = value
  cell.style = { ...style }
}

/**
 * Writes a figure, aligning "[c]" right where it stands in for one, as the
 * numbers beside it are.
 *
 * @param {ExcelJS.Cell} cell
 * @param {number | string} value
 * @param {Partial<ExcelJS.Style>} style
 */
export const writeFigure = (cell, value, style) =>
  write(
    cell,
    value,
    value === CONFIDENTIAL
      ? { ...style, alignment: { ...style.alignment, horizontal: 'right' } }
      : style
  )

/**
 * @param {ExcelJS.Worksheet} worksheet
 * @param {number} row
 * @param {number} firstColumn
 * @param {readonly (string | number | Date | null)[]} values - written rightwards
 * @param {Partial<ExcelJS.Style>} style
 */
export const writeRow = (worksheet, row, firstColumn, values, style) => {
  values.forEach((value, index) => {
    write(worksheet.getCell(row, firstColumn + index), value, style)
  })
}

/**
 * Styles cells that hold no text, such as a band.
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @param {number} row
 * @param {number} firstColumn
 * @param {number} count
 * @param {Partial<ExcelJS.Style>} style
 */
export const styleEmptyCells = (worksheet, row, firstColumn, count, style) => {
  const empty = Array.from({ length: count }, () => null)
  writeRow(worksheet, row, firstColumn, empty, style)
}

/**
 * @param {ExcelJS.Worksheet} worksheet
 * @param {Readonly<Record<string, number>>} widths - in column order
 * @param {number} [firstColumn]
 */
export const setWidths = (worksheet, widths, firstColumn = 1) => {
  Object.values(widths).forEach((width, index) => {
    worksheet.getColumn(firstColumn + index).width = width
  })
}

const WHOLE_NUMBER = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 0
})

/**
 * The text a cell shows, as far as its width is concerned.
 *
 * @param {ExcelJS.Cell} cell
 * @returns {string}
 */
const shownText = ({ value, numFmt }) => {
  if (typeof value === 'number') {
    return numFmt === WHOLE_TONNES ? WHOLE_NUMBER.format(value) : String(value)
  }
  if (typeof value === 'string') {
    return value
  }
  if (value && typeof value === 'object' && 'richText' in value) {
    return value.richText.map(({ text }) => text).join('')
  }
  return ''
}

const DEFAULT_FONT_SIZE = 11
const EXCEL_DEFAULT_COLUMN_WIDTH = 8.43
// Excel's width for n characters is n plus its cell margin, in characters of its default font.
const CELL_MARGIN_PIXELS = 5
const CHARACTER_PIXELS = 7
const CELL_MARGIN = CELL_MARGIN_PIXELS / CHARACTER_PIXELS
// Counts characters, not glyph widths; one spare character covers bold and wide letters.
const SPARE_CHARACTERS = 1

/**
 * Widens each column so every table cell in it shows its full text, so nobody
 * has to adjust the workbook after it is generated. A table cell is one with a
 * border, and only tables have borders. Text that wraps or sits in merged
 * cells keeps its own layout, as does text outside a table, which runs on
 * into the empty cells beside it. A column is never narrowed. A date is not
 * measured, because the only dates in a table are month headings, which wrap.
 *
 * @param {ExcelJS.Worksheet} worksheet
 */
export const fitColumnsToTables = (worksheet) => {
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      const inTable = Object.keys(cell.border ?? {}).length > 0
      if (!inTable || cell.isMerged || cell.alignment?.wrapText) {
        return
      }
      const scale = (cell.font?.size ?? DEFAULT_FONT_SIZE) / DEFAULT_FONT_SIZE
      const needed =
        Math.ceil(shownText(cell).length * scale) +
        SPARE_CHARACTERS +
        CELL_MARGIN
      const column = worksheet.getColumn(cell.col)
      if (needed > (column.width ?? EXCEL_DEFAULT_COLUMN_WIDTH)) {
        column.width = needed
      }
    })
  })
}

export const UK_SCOPE = 'uk'

/**
 * @param {ScopeFigures[]} scopes
 * @param {string} name
 */
export const tableOf = (scopes, name) => {
  const scope = scopes.find((candidate) => candidate.name === name)
  if (scope === undefined) {
    throw new Error(`The market insights figures have no ${name} scope`)
  }
  return scope.table
}

/**
 * Whether any month of the period has an operator accredited for the
 * material, of either accreditation type.
 *
 * @param {ReprocessorExporterTable} table
 * @param {Material} material
 */
export const hasAccreditedOperator = (table, material) =>
  Object.values(table.data.months).some(({ figures }) =>
    Object.values(figures[material]).some(
      ({ operatorCount }) => operatorCount > 0
    )
  )

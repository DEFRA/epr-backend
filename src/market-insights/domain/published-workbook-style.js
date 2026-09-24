/**
 * The presentation of the published market insights workbook: its typeface,
 * borders, bands, number format and column widths, as published.
 */

/** @import { Alignment, Borders, Fill, Font, Style } from 'exceljs' */

/**
 * @param {Partial<Font>} [font]
 * @returns {Partial<Font>}
 */
const typeface = (font = {}) => ({ name: 'Aptos Narrow', size: 11, ...font })

/** @type {Partial<Borders>} */
const BOXED = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' }
}

/** @type {Partial<Borders>} */
const TOTALLED = {
  ...BOXED,
  top: { style: 'double' },
  bottom: { style: 'double' }
}

/** @type {Fill} */
const BLACK = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF000000' }
}

/** @type {Partial<Alignment>} */
const WRAPPED_TOP = { vertical: 'top', wrapText: true }

const WHOLE_TONNES = '#,##0'

/** @type {Partial<Style>} */
export const NOTE = {
  font: typeface({ italic: true }),
  alignment: { horizontal: 'left', ...WRAPPED_TOP }
}

/** @type {Partial<Style>} */
export const INTRODUCTION = { font: typeface({ bold: true, size: 13 }) }

/** @type {Partial<Style>} */
export const DATA_AS_OF = { font: typeface({ bold: true, italic: true }) }

/**
 * A black strip across the page, between the notes and the tables.
 *
 * @type {Partial<Style>}
 */
export const BAND = { fill: BLACK }

/** @type {Partial<Style>} */
export const LABEL = { font: typeface(), border: BOXED }

/** @type {Partial<Style>} */
export const FIGURE = { font: typeface(), border: BOXED, numFmt: WHOLE_TONNES }

/** @type {Partial<Style>} */
export const WASTE_BALANCE_HEADING = {
  font: typeface({ bold: true }),
  alignment: { vertical: 'middle', wrapText: true },
  border: BOXED
}

/** @type {Partial<Style>} */
export const WASTE_BALANCE_MONTH_HEADING = {
  ...WASTE_BALANCE_HEADING,
  alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
  numFmt: 'mmm-yy'
}

/** @type {Partial<Style>} */
export const KEY_INTRODUCTION = { font: typeface({ bold: true, size: 12 }) }

/** @type {Partial<Style>} */
export const KEY_HEADING = {
  font: typeface({ bold: true, size: 12 }),
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: BOXED
}

/** @type {Partial<Style>} */
export const KEY_FIELD = {
  font: typeface({ bold: true }),
  alignment: WRAPPED_TOP,
  border: BOXED
}

/** @type {Partial<Style>} */
export const KEY_DESCRIPTION = {
  font: typeface(),
  alignment: WRAPPED_TOP,
  border: BOXED
}

/** @type {Partial<Style>} */
export const OUTSTANDING_RETURNS_MONTH = {
  font: typeface({ bold: true }),
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: BOXED
}

/** @type {Partial<Style>} */
export const OUTSTANDING_RETURNS_HEADING = {
  font: typeface({ bold: true }),
  alignment: WRAPPED_TOP,
  border: BOXED
}

/** @type {Partial<Style>} */
export const TONNAGE_BAND = {
  font: typeface(),
  alignment: { vertical: 'middle', wrapText: true },
  border: BOXED
}

/** @type {Partial<Style>} */
export const COUNT = { font: typeface(), border: BOXED }

/** @type {Partial<Style>} */
export const NATION_FIGURES_MONTH = {
  font: typeface({ bold: true, size: 12, color: { argb: 'FFFFFFFF' } }),
  alignment: { horizontal: 'left' },
  fill: BLACK
}

/** @type {Partial<Style>} */
export const NATION_FIGURES_TITLE = { font: typeface({ bold: true }) }

/** @type {Partial<Style>} */
export const NATION_FIGURES_HEADING = {
  font: typeface({ bold: true, size: 9 }),
  alignment: { horizontal: 'left', ...WRAPPED_TOP },
  border: BOXED
}

/** @type {Partial<Style>} */
export const GRAND_TOTAL_LABEL = {
  font: typeface({ bold: true }),
  border: TOTALLED
}

/** @type {Partial<Style>} */
export const GRAND_TOTAL_FIGURE = {
  ...GRAND_TOTAL_LABEL,
  numFmt: WHOLE_TONNES
}

/**
 * Row heights, in points, as published. The notes sit in merged cells, and
 * Excel never fits a merged cell's rows to its text.
 */
export const ROW_HEIGHT = Object.freeze({
  WASTE_BALANCE_NOTE: 31.7,
  WASTE_BALANCE_BAND: 8.1,
  WASTE_BALANCE_HEADINGS: 27.95,
  OUTSTANDING_RETURNS_NOTE: 57.6,
  OUTSTANDING_RETURNS_BAND: 9.75,
  OUTSTANDING_RETURNS_MONTH: 23.65,
  OUTSTANDING_RETURNS_ROW: 27.95,
  NATION_FIGURES_NOTE: 54,
  NATION_FIGURES_HEADINGS: 51.4
})

/** The Key's row heights, in points, by row number, as published. */
export const KEY_ROW_HEIGHTS = Object.freeze({
  1: 6.75,
  2: 17.85,
  3: 5.65,
  4: 24.75,
  5: 23.65,
  6: 26.85,
  7: 93,
  8: 94.15,
  9: 67.15,
  10: 75.2,
  11: 65.1,
  12: 63.4,
  13: 66.2,
  14: 51.75,
  15: 51,
  16: 53.85,
  17: 5.65,
  18: 33.95,
  19: 33.95,
  20: 39.75,
  21: 40.9,
  22: 65.65
})

/** Column widths, in characters, from column A. */
export const COLUMN_WIDTHS = Object.freeze({
  WASTE_BALANCE: [15.14, 12.86],
  KEY: [30.43, 50.43, 2.14, 30.43, 50.43],
  OUTSTANDING_RETURNS_MONTH: [15.43, 15.43, 2.14],
  NATION_FIGURES: [
    14.71, 11.86, 12.43, 10.71, 10.71, 10.71, 10.71, 10.71, 10.71, 10.71, 10.71
  ]
})

import { NATION, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  CONFIDENTIAL,
  fromFewOperators
} from '#market-insights/domain/confidential-figures.js'
import { nationSegment } from '#market-insights/domain/nation-segment.js'
import {
  COLUMN_WIDTHS,
  FIGURE,
  GRAND_TOTAL_FIGURE,
  GRAND_TOTAL_LABEL,
  GRAND_TOTAL_NO_FIGURE,
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
  NATION_FIGURES_TABLES,
  NO_FIGURE,
  WORKSHEET_NAME
} from '#market-insights/domain/published-workbook-text.js'
import {
  firstDayOf,
  hasAccreditedOperator,
  monthAndYear,
  richNote,
  setWidths,
  tableOf,
  UK_SCOPE,
  write,
  writeRow
} from './cells.js'

/** @import ExcelJS from 'exceljs' */
/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { WasteProcessingTypeValue } from '#domain/organisations/model.js' */
/** @import { ReprocessorExporterTable } from '#market-insights/application/reprocessor-exporter-table.js' */
/** @import { ExporterFigure, FiguresTable, ReprocessorFigure } from '#market-insights/domain/published-workbook-text.js' */
/** @import { OperatorCounts } from '#market-insights/application/operator-counts.js' */
/** @import { RedactableTabContents } from './cells.js' */

const NATION_FIGURES_FIRST_ROW = 2
const NATION_FIGURES_WIDTH = Math.max(
  ...Object.values(NATION_FIGURES_TABLES).map(({ columns }) => columns.length)
)

/** @typedef {typeof WORKSHEET_NAME.UK | typeof WORKSHEET_NAME.ENGLAND} NationFiguresTabName */

/**
 * The scope of the figures each tab is filled from.
 *
 * @type {Readonly<Record<NationFiguresTabName, string>>}
 */
const SCOPE_OF_TAB = {
  [WORKSHEET_NAME.UK]: UK_SCOPE,
  [WORKSHEET_NAME.ENGLAND]: nationSegment(NATION.ENGLAND)
}

/** @typedef {ReprocessorFigure | ExporterFigure} Figure */

/**
 * A table on the tab: its wording and figures, and the accreditation type it
 * is filled from.
 *
 * @typedef {FiguresTable<Figure> & {
 *   accreditationType: WasteProcessingTypeValue
 * }} NationFiguresTable
 */

/** @type {Readonly<Record<keyof typeof NATION_FIGURES_TABLES, NationFiguresTable>>} */
const TABLES = {
  reprocessor: {
    ...NATION_FIGURES_TABLES.reprocessor,
    accreditationType: WASTE_PROCESSING_TYPE.REPROCESSOR
  },
  exporter: {
    ...NATION_FIGURES_TABLES.exporter,
    accreditationType: WASTE_PROCESSING_TYPE.EXPORTER
  },
  reprocessorPrn: {
    ...NATION_FIGURES_TABLES.reprocessorPrn,
    accreditationType: WASTE_PROCESSING_TYPE.REPROCESSOR
  },
  exporterPern: {
    ...NATION_FIGURES_TABLES.exporterPern,
    accreditationType: WASTE_PROCESSING_TYPE.EXPORTER
  }
}

/**
 * A figure of a row or grand total as published: the figure served, or a
 * dash where the row serves none, as no grand total serves an average price.
 *
 * @param {Partial<Record<Figure, number>>} row
 * @param {Figure} figure
 * @returns {number | string}
 */
const publishedFigure = (row, figure) => row[figure] ?? NO_FIGURE

/** @typedef {Partial<Record<Figure, number>> & OperatorCounts} ServedRow */

/**
 * Whether any figure a row prints, across both of its accreditation type's
 * tables, holds data.
 *
 * @param {ServedRow} row
 * @param {WasteProcessingTypeValue} accreditationType
 */
const holdsData = (row, accreditationType) =>
  Object.values(TABLES)
    .filter((table) => table.accreditationType === accreditationType)
    .some(({ figures }) => figures.some((figure) => (row[figure] ?? 0) !== 0))

/**
 * A row or grand total's figures for one table as published, each shown as
 * "[c]" where redacted and the row is from too few operators. A dash stays a
 * dash, since it gives nothing away.
 *
 * @param {ServedRow} row
 * @param {NationFiguresTable} table
 * @param {boolean} redacted
 * @returns {(number | string)[]}
 */
const publishedFigures = (row, { figures, accreditationType }, redacted) => {
  const values = figures.map((figure) => publishedFigure(row, figure))
  return redacted && fromFewOperators(row, holdsData(row, accreditationType))
    ? values.map((value) => (value === NO_FIGURE ? value : CONFIDENTIAL))
    : values
}

/**
 * @param {ReprocessorExporterTable} table
 * @param {string} scope
 * @param {YearMonth} month
 */
const servedMonthOf = (table, scope, month) => {
  const served = table.data.months[month]
  if (served === undefined) {
    throw new Error(`The ${scope} market insights figures have no ${month}`)
  }
  return served
}

/**
 * @param {ExcelJS.Worksheet} worksheet
 * @param {number} row
 * @param {readonly (number | string)[]} values - written from column B
 * @param {(value: number | string) => Partial<ExcelJS.Style>} styleOf
 */
const writeFigures = (worksheet, row, values, styleOf) => {
  values.forEach((value, index) => {
    write(worksheet.getCell(row, 2 + index), value, styleOf(value))
  })
}

/**
 * A UK or England tab: every month's tonnage tables, then every month's PRN
 * and PERN tables, each month a section of two tables under the month's name.
 *
 * @param {ExcelJS.Workbook} workbook
 * @param {NationFiguresTabName} name
 * @param {RedactableTabContents} contents
 */
export const addNationFigures = (
  workbook,
  name,
  { months, figures, redacted }
) => {
  const scope = SCOPE_OF_TAB[name]
  const table = tableOf(figures.scopes, scope)
  const materials = NATION_FIGURES_MATERIALS.filter(([material]) =>
    hasAccreditedOperator(table, material)
  )
  // A title, the headings, a row per material, the grand total, then a blank row.
  const tableRows = 2 + materials.length + 1 + 1
  // A month title over two tables.
  const sectionRows = 1 + 2 * tableRows

  const worksheet = workbook.addWorksheet(name)
  setWidths(worksheet, COLUMN_WIDTHS.NATION_FIGURES)
  write(worksheet.getCell('A1'), richNote(NATION_FIGURES_NOTE), NOTE)
  worksheet.mergeCells(1, 1, 1, NATION_FIGURES_WIDTH)
  worksheet.getRow(1).height = ROW_HEIGHT.NATION_FIGURES_NOTE

  const { reprocessor, exporter, reprocessorPrn, exporterPern } = TABLES
  const sections = [
    ...months.map((month) => ({ month, tables: [reprocessor, exporter] })),
    ...months.map((month) => ({
      month,
      tables: [reprocessorPrn, exporterPern]
    }))
  ]

  sections.forEach(({ month, tables }, sectionIndex) => {
    const top = NATION_FIGURES_FIRST_ROW + sectionRows * sectionIndex
    write(
      worksheet.getCell(top, 1),
      monthAndYear.format(firstDayOf(month)),
      NATION_FIGURES_MONTH
    )
    worksheet.mergeCells(top, 1, top, NATION_FIGURES_WIDTH)
    const served = servedMonthOf(table, scope, month)

    tables.forEach((table, index) => {
      const { title, columns, accreditationType } = table
      const tableTop = top + 1 + tableRows * index
      write(worksheet.getCell(tableTop, 1), title, NATION_FIGURES_TITLE)
      writeRow(worksheet, tableTop + 1, 1, columns, NATION_FIGURES_HEADING)
      worksheet.getRow(tableTop + 1).height = ROW_HEIGHT.NATION_FIGURES_HEADINGS

      materials.forEach(([material, label], materialIndex) => {
        const row = tableTop + 2 + materialIndex
        write(worksheet.getCell(row, 1), label, LABEL)
        writeFigures(
          worksheet,
          row,
          publishedFigures(
            served.figures[material][accreditationType],
            table,
            redacted
          ),
          () => FIGURE
        )
      })

      const totalRow = tableTop + 2 + materials.length
      write(worksheet.getCell(totalRow, 1), GRAND_TOTAL, GRAND_TOTAL_LABEL)
      writeFigures(
        worksheet,
        totalRow,
        publishedFigures(served.totals[accreditationType], table, redacted),
        (value) =>
          value === NO_FIGURE ? GRAND_TOTAL_NO_FIGURE : GRAND_TOTAL_FIGURE
      )
    })
  })
}

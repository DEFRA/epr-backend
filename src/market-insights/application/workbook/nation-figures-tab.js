import { WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
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
  monthAndYear,
  richNote,
  setWidths,
  write,
  writeRow
} from './cells.js'

/** @import ExcelJS from 'exceljs' */
/** @import { Material, WasteProcessingTypeValue } from '#domain/organisations/model.js' */
/** @import { ScopeFigures } from '#market-insights/application/read-figures.js' */
/** @import { ReprocessorExporterTable } from '#market-insights/application/reprocessor-exporter-table.js' */
/** @import { ExporterFigure, FiguresTable, ReprocessorFigure } from '#market-insights/domain/published-workbook-text.js' */
/** @import { TabContents } from './cells.js' */

const NATION_FIGURES_FIRST_ROW = 2
const NATION_FIGURES_WIDTH = Math.max(
  ...Object.values(NATION_FIGURES_TABLES).map(({ columns }) => columns.length)
)

const UK_SCOPE = 'uk'

/**
 * The scope of the figures each tab is filled from.
 *
 * @type {ReadonlyMap<string, string>}
 */
const SCOPE_OF_TAB = new Map([[WORKSHEET_NAME.UK, UK_SCOPE]])

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

/**
 * @param {ScopeFigures[]} scopes
 * @param {string} name
 */
const tableOf = (scopes, name) => {
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
const hasAccreditedOperator = (table, material) =>
  Object.values(table.data.months).some(({ figures }) =>
    Object.values(figures[material]).some(
      ({ operatorCount }) => operatorCount > 0
    )
  )

/**
 * @param {ExcelJS.Worksheet} worksheet
 * @param {number} row
 * @param {readonly (number | string | null)[]} values - written from column B
 * @param {(value: number | string | null) => Partial<ExcelJS.Style>} styleOf
 */
const writeFigures = (worksheet, row, values, styleOf) => {
  values.forEach((value, index) => {
    write(worksheet.getCell(row, 2 + index), value, styleOf(value))
  })
}

/**
 * A UK or England tab: every month's tonnage tables, then every month's PRN
 * and PERN tables, each month a section of two tables under the month's name.
 * A tab with figures to fill from prints them as served; any other prints the
 * layout with its figure cells empty.
 *
 * @param {ExcelJS.Workbook} workbook
 * @param {string} name
 * @param {TabContents} contents
 */
export const addNationFigures = (workbook, name, { months, figures }) => {
  const ukTable = tableOf(figures.scopes, UK_SCOPE)
  const scope = SCOPE_OF_TAB.get(name)
  const table = scope === undefined ? undefined : tableOf(figures.scopes, scope)
  const materials = NATION_FIGURES_MATERIALS.filter(([material]) =>
    hasAccreditedOperator(ukTable, material)
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
    const served = table?.data.months[month]

    tables.forEach(
      ({ title, columns, accreditationType, figures: tableFigures }, index) => {
        const tableTop = top + 1 + tableRows * index
        write(worksheet.getCell(tableTop, 1), title, NATION_FIGURES_TITLE)
        writeRow(worksheet, tableTop + 1, 1, columns, NATION_FIGURES_HEADING)
        worksheet.getRow(tableTop + 1).height =
          ROW_HEIGHT.NATION_FIGURES_HEADINGS

        materials.forEach(([material, label], materialIndex) => {
          const row = tableTop + 2 + materialIndex
          const figuresRow = served?.figures[material][accreditationType]
          write(worksheet.getCell(row, 1), label, LABEL)
          writeFigures(
            worksheet,
            row,
            tableFigures.map((figure) =>
              figuresRow === undefined
                ? null
                : publishedFigure(figuresRow, figure)
            ),
            () => FIGURE
          )
        })

        const totalRow = tableTop + 2 + materials.length
        const total = served?.totals[accreditationType]
        write(worksheet.getCell(totalRow, 1), GRAND_TOTAL, GRAND_TOTAL_LABEL)
        writeFigures(
          worksheet,
          totalRow,
          tableFigures.map((figure) =>
            total === undefined ? null : publishedFigure(total, figure)
          ),
          (value) =>
            value === NO_FIGURE ? GRAND_TOTAL_NO_FIGURE : GRAND_TOTAL_FIGURE
        )
      }
    )
  })
}

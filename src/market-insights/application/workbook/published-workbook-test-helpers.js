import path from 'node:path'
import ExcelJS from 'exceljs'
import { assertPresent } from '#test/type-helpers.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { createMockLogger } from '#test/mock-logger.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { readMarketInsightsFigures } from '#market-insights/application/read-figures.js'
import { NO_FIGURE } from '#market-insights/domain/published-workbook-text.js'
import { frameOf } from './cells.js'

/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { ReadMarketInsightsFiguresParams } from '#market-insights/application/read-figures.js' */
/** @import { TabContents } from './cells.js' */

const PUBLISHED_WORKBOOK = path.join(
  import.meta.dirname,
  '../../../data/fixtures/market-insights/published-january-to-june-2026.xlsx'
)

export const JANUARY_TO_JUNE_2026 = [
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06'
].map(toYearMonth)

// The published file says its data is as of 10 August 2026.
export const PUBLISHED_EXTRACTION = new Date('2026-08-10T09:00:00.000Z')

/**
 * What the shared read is given for a period, over an empty register, taken
 * when the published figures were.
 *
 * @param {YearMonth[]} months
 * @returns {ReadMarketInsightsFiguresParams}
 */
export const readParamsFor = (months) => ({
  ledgerRepository: createInMemoryLedgerRepository()(),
  summaryLogRowStatesRepository:
    createInMemorySummaryLogRowStatesRepository()(),
  organisationsRepository: createInMemoryOrganisationsRepository([])(),
  overseasSitesRepository: createInMemoryOverseasSitesRepository([])(),
  reportsRepository: createInMemoryReportsRepository()(),
  logger: createMockLogger(),
  year: 2026,
  months,
  now: PUBLISHED_EXTRACTION
})

/**
 * What a tab that carries figures is given for a period.
 *
 * @param {YearMonth[]} months
 * @returns {Promise<TabContents>}
 */
export const contentsFor = async (months) => ({
  ...frameOf({ months, now: PUBLISHED_EXTRACTION }),
  figures: await readMarketInsightsFigures(readParamsFor(months))
})

/**
 * @returns {Promise<ExcelJS.Workbook>}
 */
export const readPublishedWorkbook = async () => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(PUBLISHED_WORKBOOK)
  return workbook
}

/**
 * @param {ExcelJS.Workbook} workbook
 * @param {string} name
 * @returns {ExcelJS.Worksheet}
 */
export const sheet = (workbook, name) => {
  const worksheet = workbook.getWorksheet(name)
  assertPresent(worksheet)
  return worksheet
}

/**
 * @param {ExcelJS.Workbook} workbook
 * @returns {Promise<ExcelJS.Workbook>} the workbook as a reader of the file sees it
 */
export const reread = async (workbook) => {
  const file = new ExcelJS.Workbook()
  await file.xlsx.load(await workbook.xlsx.writeBuffer())
  return file
}

/**
 * @param {(workbook: ExcelJS.Workbook) => void} addTab
 * @returns {Promise<ExcelJS.Worksheet>} the one tab, as a reader of the file sees it
 */
export const renderTab = async (addTab) => {
  const workbook = new ExcelJS.Workbook()
  addTab(workbook)
  const [worksheet] = (await reread(workbook)).worksheets
  assertPresent(worksheet)
  return worksheet
}

/**
 * @param {ExcelJS.Cell} cell
 * @returns {string}
 */
const textOf = (cell) => {
  const { value } = cell
  if (value instanceof Date) {
    return `${value.toISOString()} as ${cell.numFmt}`
  }
  if (value && typeof value === 'object' && 'richText' in value) {
    return value.richText.map(({ text }) => text).join('')
  }
  if (value && typeof value === 'object' && 'hyperlink' in value) {
    return value.text
  }
  return String(value)
}

/**
 * Every cell on a tab that is not a figure, by address.
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @returns {Record<string, ExcelJS.Cell>}
 */
const wordingCellsOf = (worksheet) => {
  /** @type {Record<string, ExcelJS.Cell>} */
  const cells = {}
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (
        cell.type !== ExcelJS.ValueType.Merge &&
        typeof cell.value !== 'number' &&
        cell.value !== NO_FIGURE
      ) {
        cells[cell.address] = cell
      }
    })
  })
  return cells
}

/**
 * @template T
 * @param {Record<string, ExcelJS.Cell>} cells
 * @param {(cell: ExcelJS.Cell) => T} read
 * @returns {Record<string, T>}
 */
const eachOf = (cells, read) =>
  Object.fromEntries(
    Object.entries(cells).map(([address, cell]) => [address, read(cell)])
  )

/**
 * Every cell's text on a tab that is not a figure.
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @returns {Record<string, string>}
 */
const wordingOf = (worksheet) => eachOf(wordingCellsOf(worksheet), textOf)

/**
 * @param {ExcelJS.Cell} cell
 */
const typefaceOf = ({ font }) => ({
  bold: Boolean(font?.bold),
  italic: Boolean(font?.italic),
  size: font?.size
})

/**
 * @param {ExcelJS.Worksheet} worksheet
 * @returns {string[]} the addresses of the cells that wrap their text
 */
const wrappedIn = (worksheet) => {
  const cells = wordingCellsOf(worksheet)
  return Object.keys(cells).filter(
    (address) => cells[address]?.alignment?.wrapText
  )
}

/**
 * @param {ExcelJS.Worksheet} worksheet
 * @returns {string[]}
 */
const mergesOf = (worksheet) => [...worksheet.model.merges].sort()

/**
 * Compares a generated tab with the same tab of the published workbook, cell
 * by cell: its wording, each wording cell's typeface, the cells it wraps and
 * its merges.
 *
 * @param {string} name - of the tab
 * @param {() => Promise<ExcelJS.Worksheet>} renderGenerated
 */
export const itMatchesThePublishedTab = (name, renderGenerated) => {
  /** @type {ExcelJS.Worksheet} */
  let published
  /** @type {ExcelJS.Worksheet} */
  let generated

  beforeAll(async () => {
    published = sheet(await readPublishedWorkbook(), name)
    generated = await renderGenerated()
  })

  it('words the tab cell for cell as published', () => {
    const expected = wordingOf(published)

    expect(Object.keys(expected)).not.toHaveLength(0)
    expect(wordingOf(generated)).toEqual(expected)
  })

  it('sets the tab in the published typeface', () => {
    expect(eachOf(wordingCellsOf(generated), typefaceOf)).toEqual(
      eachOf(wordingCellsOf(published), typefaceOf)
    )
  })

  it('wraps every cell that the published file wraps', () => {
    const expected = wrappedIn(published)

    expect(expected).not.toHaveLength(0)
    expect(wrappedIn(generated)).toEqual(expect.arrayContaining(expected))
  })

  it("merges the tab's cells as published", () => {
    expect(mergesOf(generated)).toEqual(mergesOf(published))
  })
}

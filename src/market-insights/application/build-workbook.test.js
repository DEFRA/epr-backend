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
import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import { buildMarketInsightsWorkbook } from './build-workbook.js'

/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { ReadMarketInsightsFiguresParams } from '#market-insights/application/read-figures.js' */

const PUBLISHED_WORKBOOK = path.join(
  import.meta.dirname,
  '../../data/fixtures/market-insights/published-january-to-june-2026.xlsx'
)

const JANUARY_TO_JUNE_2026 = [
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06'
].map(toYearMonth)

// The published file says its data is as of 10 August 2026.
const PUBLISHED_EXTRACTION = new Date('2026-08-10T09:00:00.000Z')

/**
 * The hand-made slips on one published tab that a generated workbook does
 * not repeat.
 *
 * @typedef {Object} PublishedSlips
 * @property {number[]} [extraBlankRows] - rows a generated tab does not have
 * @property {Record<string, { published: string, generated: string }>} [corrections] - by published address
 */

const JANUARY_WITH_TRAILING_SPACE = {
  published: 'January ',
  generated: 'January'
}
const GLASS_RE_MELT_WITH_HYPHEN = {
  published: 'Glass- re-melt',
  generated: 'Glass re-melt'
}

/**
 * Every slip, by tab, so that any other difference fails.
 *
 * @type {Record<string, PublishedSlips>}
 */
const PUBLISHED_SLIPS = {
  [WORKSHEET_NAME.UK]: {
    extraBlankRows: [49, 211, 235, 259],
    corrections: { A7: GLASS_RE_MELT_WITH_HYPHEN }
  },
  [WORKSHEET_NAME.ENGLAND]: {
    extraBlankRows: [49, 211, 235, 259],
    corrections: { A7: GLASS_RE_MELT_WITH_HYPHEN }
  },
  [WORKSHEET_NAME.OUTSTANDING_RETURNS]: {
    corrections: Object.fromEntries(
      [7, 14, 21, 28, 35, 42, 49].map((row) => [
        `A${row}`,
        JANUARY_WITH_TRAILING_SPACE
      ])
    )
  }
}

// Where the published file has no average to show, it puts a dash. That is a
// figure, and figures are not this workbook's yet.
const NO_FIGURE = '-'

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
 * Where a cell's address falls once a tab's extra blank rows are closed up.
 *
 * @param {string} address - e.g. 'A258'
 * @param {number[]} extraBlankRows
 * @returns {string}
 */
const closeUp = (address, extraBlankRows) => {
  const column = address.replace(/\d+$/, '')
  const row = Number(address.slice(column.length))
  const shift = extraBlankRows.filter((blank) => blank < row).length
  return `${column}${row - shift}`
}

/**
 * Every cell on a tab that is not a figure, keyed by where a generated tab
 * has it.
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @param {PublishedSlips} [slips] - the extra blank rows are checked to be blank, then closed up
 * @returns {Record<string, ExcelJS.Cell>}
 */
const wordingCellsOf = (worksheet, { extraBlankRows = [] } = {}) => {
  for (const blank of extraBlankRows) {
    expect(worksheet.getRow(blank).hasValues).toBe(false)
  }
  /** @type {Record<string, ExcelJS.Cell>} */
  const cells = {}
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (
        cell.type !== ExcelJS.ValueType.Merge &&
        typeof cell.value !== 'number' &&
        cell.value !== NO_FIGURE
      ) {
        cells[closeUp(cell.address, extraBlankRows)] = cell
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
 * @param {PublishedSlips} [slips] - checked to be as listed, then undone
 * @returns {Record<string, string>}
 */
const wordingOf = (worksheet, slips = {}) => {
  const { corrections = {} } = slips
  return eachOf(wordingCellsOf(worksheet, slips), (cell) => {
    const correction = corrections[cell.address]
    if (correction) {
      expect(textOf(cell)).toBe(correction.published)
    }
    return correction?.generated ?? textOf(cell)
  })
}

/**
 * @param {ExcelJS.Cell} cell
 */
const typefaceOf = ({ font }) => ({
  bold: Boolean(font?.bold),
  italic: Boolean(font?.italic),
  size: font?.size
})

/**
 * @param {Record<string, ExcelJS.Cell>} cells
 * @returns {string[]} the addresses of the cells that wrap their text
 */
const wrappedIn = (cells) =>
  Object.keys(cells).filter((address) => cells[address]?.alignment?.wrapText)

/**
 * @param {ExcelJS.Worksheet} worksheet
 * @param {PublishedSlips} [slips]
 * @returns {string[]}
 */
const mergesOf = (worksheet, { extraBlankRows = [] } = {}) =>
  worksheet.model.merges
    .map((range) =>
      range
        .split(':')
        .map((address) => closeUp(address, extraBlankRows))
        .join(':')
    )
    .sort()

/**
 * @param {ExcelJS.Workbook} workbook
 * @returns {Promise<ExcelJS.Workbook>} the workbook as a reader of the file sees it
 */
const reread = async (workbook) => {
  const file = new ExcelJS.Workbook()
  await file.xlsx.load(await workbook.xlsx.writeBuffer())
  return file
}

/**
 * @param {YearMonth[]} [months]
 * @param {Partial<ReadMarketInsightsFiguresParams>} [overrides]
 */
const build = async (months = JANUARY_TO_JUNE_2026, overrides = {}) =>
  reread(
    await buildMarketInsightsWorkbook({
      ledgerRepository: createInMemoryLedgerRepository()(),
      summaryLogRowStatesRepository:
        createInMemorySummaryLogRowStatesRepository()(),
      organisationsRepository: createInMemoryOrganisationsRepository([])(),
      overseasSitesRepository: createInMemoryOverseasSitesRepository([])(),
      reportsRepository: createInMemoryReportsRepository()(),
      logger: createMockLogger(),
      year: 2026,
      months,
      now: PUBLISHED_EXTRACTION,
      ...overrides
    })
  )

/**
 * @param {ExcelJS.Workbook} workbook
 * @param {string} name
 */
const sheet = (workbook, name) => {
  const worksheet = workbook.getWorksheet(name)
  assertPresent(worksheet)
  return worksheet
}

describe('building the published market insights workbook', () => {
  /** @type {ExcelJS.Workbook} */
  let published
  /** @type {ExcelJS.Workbook} */
  let generated

  beforeAll(async () => {
    published = new ExcelJS.Workbook()
    await published.xlsx.readFile(PUBLISHED_WORKBOOK)
    generated = await build()
  })

  it('has the published tabs, in the published order, trailing spaces and all', () => {
    expect(generated.worksheets.map(({ name }) => name)).toEqual(
      published.worksheets.map(({ name }) => name)
    )
  })

  const TABS = Object.values(WORKSHEET_NAME)

  it.each(TABS)('words the %j tab cell for cell as published', (name) => {
    const expected = wordingOf(sheet(published, name), PUBLISHED_SLIPS[name])

    expect(Object.keys(expected)).not.toHaveLength(0)
    expect(wordingOf(sheet(generated, name))).toEqual(expected)
  })

  it.each(TABS)('sets the %j tab in the published typeface', (name) => {
    expect(eachOf(wordingCellsOf(sheet(generated, name)), typefaceOf)).toEqual(
      eachOf(
        wordingCellsOf(sheet(published, name), PUBLISHED_SLIPS[name]),
        typefaceOf
      )
    )
  })

  it.each(TABS)(
    'wraps every cell on the %j tab that the published file wraps',
    (name) => {
      const expected = wrappedIn(
        wordingCellsOf(sheet(published, name), PUBLISHED_SLIPS[name])
      )

      expect(expected).not.toHaveLength(0)
      expect(wrappedIn(wordingCellsOf(sheet(generated, name)))).toEqual(
        expect.arrayContaining(expected)
      )
    }
  )

  it.each(TABS)("merges the %j tab's cells as published", (name) => {
    expect(mergesOf(sheet(generated, name))).toEqual(
      mergesOf(sheet(published, name), PUBLISHED_SLIPS[name])
    )
  })

  it('links the waste balance note to its GOV.UK page', () => {
    expect(
      sheet(generated, WORKSHEET_NAME.WASTE_BALANCE).getCell('A1').hyperlink
    ).toBe(
      'https://www.gov.uk/government/publications/packaging-waste-data-reported-by-reprocessors-and-exporters'
    )
  })

  it('lays each month out after the last, however long the period', async () => {
    const januaryToMarch = await build(
      ['2026-01', '2026-02', '2026-03'].map(toYearMonth)
    )

    expect(
      sheet(januaryToMarch, WORKSHEET_NAME.WASTE_BALANCE).getCell('F9').value
    ).toBe('Total')
    expect(
      sheet(januaryToMarch, WORKSHEET_NAME.OUTSTANDING_RETURNS).getCell('G7')
        .value
    ).toBe('March')
    expect(
      sheet(januaryToMarch, WORKSHEET_NAME.OUTSTANDING_RETURNS).getCell('J7')
        .value
    ).toBeNull()

    const uk = sheet(januaryToMarch, WORKSHEET_NAME.UK)
    expect(uk.getCell('A48').value).toBe('March 2026')
    expect(uk.getCell('A71').value).toBe('January 2026')
    expect(uk.getCell('A72').value).toBe('Reprocessor PRN Data ')
    expect(uk.getCell('A117').value).toBe('March 2026')
    expect(uk.rowCount).toBe(138)
  })

  it('names a period of one month by that month alone', async () => {
    const january = await build([toYearMonth('2026-01')])

    expect(
      sheet(january, WORKSHEET_NAME.WASTE_BALANCE).getCell('A5').value
    ).toBe(
      'The table below shows the UK credited waste balance for January 2026'
    )
  })

  it('dates the extraction in UK time', async () => {
    const workbook = await build(JANUARY_TO_JUNE_2026, {
      now: new Date('2026-08-09T23:30:00.000Z')
    })

    expect(
      sheet(workbook, WORKSHEET_NAME.OUTSTANDING_RETURNS).getCell('A5').value
    ).toBe('Data as of 10 August 2026  ')
  })
})

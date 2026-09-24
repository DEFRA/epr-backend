import path from 'node:path'
import ExcelJS from 'exceljs'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import { buildMarketInsightsWorkbook } from './build-workbook.js'

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
 * The published file's labels are kept by hand, and carry slips a generated
 * workbook does not repeat. Each is listed here so that any other difference
 * fails.
 */
const PUBLISHED_SLIPS = {
  /** @type {Record<string, number[]>} per tab, blank rows a generated tab does not have */
  extraBlankRows: {
    [WORKSHEET_NAME.UK]: [49, 211, 235, 259],
    [WORKSHEET_NAME.ENGLAND]: [49, 211, 235, 259]
  },
  /** @type {Record<string, Record<string, string>>} per tab, published cells as a generated tab words them */
  corrections: {
    [WORKSHEET_NAME.UK]: { A7: 'Glass re-melt' },
    [WORKSHEET_NAME.ENGLAND]: { A7: 'Glass re-melt' },
    [WORKSHEET_NAME.OUTSTANDING_RETURNS]: Object.fromEntries(
      [7, 14, 21, 28, 35, 42, 49].map((row) => [`A${row}`, 'January'])
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
  return String(value)
}

/**
 * Every cell on a tab that is not a figure, keyed by its address.
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @param {{ extraBlankRows?: number[], corrections?: Record<string, string> }} [slips]
 * @returns {Record<string, string>}
 */
const wordingOf = (
  worksheet,
  { extraBlankRows = [], corrections = {} } = {}
) => {
  /** @type {Record<string, string>} */
  const wording = {}
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (
        cell.type === ExcelJS.ValueType.Merge ||
        typeof cell.value === 'number' ||
        cell.value === NO_FIGURE
      ) {
        return
      }
      const rowNumber = Number(cell.row)
      const shift = extraBlankRows.filter((blank) => blank < rowNumber).length
      const column = cell.address.replace(/\d+$/, '')
      wording[`${column}${rowNumber - shift}`] =
        corrections[cell.address] ?? textOf(cell)
    })
  })
  return wording
}

/**
 * @param {ExcelJS.Workbook} workbook
 * @returns {Promise<ExcelJS.Workbook>} the workbook as a reader of the file sees it
 */
const reread = async (workbook) => {
  const file = new ExcelJS.Workbook()
  await file.xlsx.load(await workbook.xlsx.writeBuffer())
  return file
}

const build = async (months = JANUARY_TO_JUNE_2026, overrides = {}) =>
  reread(
    await buildMarketInsightsWorkbook({
      ledgerRepository: createInMemoryLedgerRepository()(),
      summaryLogRowStatesRepository:
        createInMemorySummaryLogRowStatesRepository()(),
      organisationsRepository: createInMemoryOrganisationsRepository([])(),
      overseasSitesRepository: createInMemoryOverseasSitesRepository([])(),
      reportsRepository: createInMemoryReportsRepository()(),
      logger: /** @type {any} */ ({ info: vi.fn(), warn: vi.fn() }),
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
  if (!worksheet) {
    throw new Error(`No worksheet named ${JSON.stringify(name)}`)
  }
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

  it.each(Object.values(WORKSHEET_NAME))(
    'words the %j tab cell for cell as published',
    (name) => {
      expect(wordingOf(sheet(generated, name))).toEqual(
        wordingOf(sheet(published, name), {
          extraBlankRows: PUBLISHED_SLIPS.extraBlankRows[name],
          corrections: PUBLISHED_SLIPS.corrections[name]
        })
      )
    }
  )

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

  it('takes its figures from the one read the export archive makes', async () => {
    const organisationsRepository = createInMemoryOrganisationsRepository([])()
    const reportsRepository = createInMemoryReportsRepository()()
    const findAll = vi.spyOn(organisationsRepository, 'findAll')
    const findReports = vi.spyOn(
      reportsRepository,
      'findPeriodicReportsForYear'
    )

    await build(JANUARY_TO_JUNE_2026, {
      organisationsRepository,
      reportsRepository
    })

    expect(findAll).toHaveBeenCalledOnce()
    expect(findReports).toHaveBeenCalledOnce()
  })
})

import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import {
  MATERIAL,
  REGULATOR,
  TONNAGE_BAND
} from '#domain/organisations/model.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { insertAccreditedOperator } from '#vite/helpers/insert-accredited-operator.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { buildOutstandingReturnsTable } from '#market-insights/application/outstanding-returns.js'
import { readMarketInsightsFigures } from '#market-insights/application/read-figures.js'
import { addOutstandingReturns } from './outstanding-returns-tab.js'
import { frameOf } from './cells.js'
import {
  contentsFor,
  itMatchesThePublishedTab,
  JANUARY_TO_JUNE_2026,
  PUBLISHED_EXTRACTION,
  readParamsFor,
  renderTab
} from './published-workbook-test-helpers.js'

/** @import ExcelJS from 'exceljs' */
/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { Material, RegulatorValue, TonnageBand } from '#domain/organisations/model.js' */
/** @import { AccreditedFor } from '#vite/helpers/insert-accredited-operator.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { ReportsRepository } from '#reports/repository/port.js' */

const JANUARY_TO_MARCH_2026 = ['2026-01', '2026-02', '2026-03'].map(toYearMonth)

/** @type {Record<Material, string>} */
const MATERIAL_LABELLED = {
  [MATERIAL.ALUMINIUM]: 'Aluminium',
  [MATERIAL.FIBRE]: 'Fibre-based composite',
  glass_other: 'Glass other',
  glass_re_melt: 'Glass re-melt',
  [MATERIAL.PAPER]: 'Paper and board',
  [MATERIAL.PLASTIC]: 'Plastic',
  [MATERIAL.STEEL]: 'Steel',
  [MATERIAL.WOOD]: 'Wood'
}

/** @param {unknown} label */
const materialLabelled = (label) =>
  Object.entries(MATERIAL_LABELLED).find(
    ([, materialLabel]) => materialLabel === label
  )?.[0]

/** @type {Record<string, TonnageBand>} */
const BAND_LABELLED = {
  'Up to 500 tonnes': TONNAGE_BAND.UP_TO_500,
  'Up to 5,000 tonnes': TONNAGE_BAND.UP_TO_5000,
  'Up to 10,000 tonnes': TONNAGE_BAND.UP_TO_10000,
  'Over 10,000 tonnes': TONNAGE_BAND.OVER_10000
}

/**
 * @typedef {{
 *   organisationsRepository: OrganisationsRepository,
 *   reportsRepository: ReportsRepository
 * }} Register
 */

/** @returns {Register} */
const emptyRegister = () => ({
  organisationsRepository: createInMemoryOrganisationsRepository()(),
  reportsRepository: createInMemoryReportsRepository()()
})

/**
 * An operator accredited for the whole of 2026, which has submitted the
 * monthly reports for the periods given and no others.
 *
 * @param {Register} register
 * @param {AccreditedFor & { regulator?: RegulatorValue, submitted?: number[] }} operator
 */
const seedOperator = async (
  { organisationsRepository, reportsRepository },
  { regulator = REGULATOR.EA, submitted = [], ...accreditedFor }
) => {
  const operator = await insertAccreditedOperator(
    organisationsRepository,
    regulator,
    accreditedFor
  )
  for (const period of submitted) {
    await buildSubmittedReport(reportsRepository, {
      ...operator,
      year: 2026,
      cadence: 'monthly',
      period
    })
  }
}

/**
 * @param {YearMonth[]} months
 * @param {Register} [register]
 */
const render = async (months, register) => {
  const contents = register
    ? {
        ...frameOf({ months, now: PUBLISHED_EXTRACTION }),
        figures: await readMarketInsightsFigures({
          ...readParamsFor(months),
          ...register
        })
      }
    : await contentsFor(months)
  return renderTab((workbook) => addOutstandingReturns(workbook, contents))
}

/**
 * What the outstanding returns route serves for the period, read from the
 * same register.
 *
 * @param {YearMonth[]} months
 * @param {Register} register
 */
const served = (months, register) =>
  buildOutstandingReturnsTable({
    ...register,
    year: 2026,
    months,
    now: PUBLISHED_EXTRACTION
  })

const MONTH_BLOCK_COLUMNS = 3

/**
 * Every count on the tab, read the way a reader of the file would: the month
 * over each block, the material in its heading and the band beside each count.
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @param {YearMonth[]} months
 * @returns {Record<string, unknown>} keyed by month, material and band
 */
const countsOnTab = (worksheet, months) => {
  /** @type {Record<string, unknown>} */
  const counts = {}
  worksheet.eachRow((row, rowNumber) => {
    months.forEach((month, monthIndex) => {
      const column = 1 + MONTH_BLOCK_COLUMNS * monthIndex
      const band = BAND_LABELLED[String(row.getCell(column).value)]
      if (band === undefined) {
        return
      }
      let headingRow = rowNumber
      while (
        BAND_LABELLED[String(worksheet.getCell(headingRow, column).value)]
      ) {
        headingRow--
      }
      const material = materialLabelled(
        worksheet.getCell(headingRow, column).value
      )
      counts[`${month} ${material} ${band}`] = row.getCell(column + 1).value
    })
  })
  return counts
}

/**
 * Asserts the tab shows every count the outstanding returns route serves for
 * the period, and leaves out only counts of zero.
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @param {YearMonth[]} months
 * @param {Register} register
 */
const expectTheServedCounts = async (worksheet, months, register) => {
  const table = await served(months, register)
  const servedCounts = Object.fromEntries(
    Object.entries(table.data.months).flatMap(([month, { figures }]) =>
      Object.entries(figures).flatMap(([material, countsByBand]) =>
        Object.entries(countsByBand).map(([band, count]) => [
          `${month} ${material} ${band}`,
          count
        ])
      )
    )
  )
  const leftOut = Object.fromEntries(
    Object.keys(servedCounts).map((key) => [key, 0])
  )

  expect({ ...leftOut, ...countsOnTab(worksheet, months) }).toEqual(
    servedCounts
  )
}

/** @type {Material[]} */
const PUBLISHED_MATERIALS = [
  MATERIAL.ALUMINIUM,
  'glass_other',
  'glass_re_melt',
  MATERIAL.PAPER,
  MATERIAL.PLASTIC,
  MATERIAL.STEEL,
  MATERIAL.WOOD
]

/**
 * A register with an accredited operator for each material the published file
 * shows, and none for fibre-based composite.
 */
const publishedRegister = async () => {
  const register = emptyRegister()
  for (const material of PUBLISHED_MATERIALS) {
    await seedOperator(register, {
      material,
      tonnageBand: TONNAGE_BAND.UP_TO_500
    })
  }
  return register
}

describe('the outstanding returns tab', () => {
  itMatchesThePublishedTab(WORKSHEET_NAME.OUTSTANDING_RETURNS, async () =>
    render(JANUARY_TO_JUNE_2026, await publishedRegister())
  )

  it('lays each month out beside the last, however long the period', async () => {
    const worksheet = await render(
      JANUARY_TO_MARCH_2026,
      await publishedRegister()
    )

    expect(worksheet.getCell('G7').value).toBe('March')
    expect(worksheet.getCell('J7').value).toBeNull()
  })

  describe('over a register owing returns', () => {
    /** @type {Register} */
    let register
    /** @type {ExcelJS.Worksheet} */
    let worksheet

    beforeAll(async () => {
      register = emptyRegister()
      await seedOperator(register, {
        material: MATERIAL.PLASTIC,
        tonnageBand: TONNAGE_BAND.OVER_10000,
        submitted: [1]
      })
      await seedOperator(register, {
        material: 'glass_other',
        tonnageBand: TONNAGE_BAND.UP_TO_500
      })
      await seedOperator(register, {
        material: MATERIAL.PAPER,
        tonnageBand: TONNAGE_BAND.UP_TO_5000,
        submitted: [1, 2]
      })
      await seedOperator(register, {
        material: MATERIAL.STEEL,
        tonnageBand: TONNAGE_BAND.UP_TO_10000
      })
      await seedOperator(register, {
        material: MATERIAL.STEEL,
        tonnageBand: TONNAGE_BAND.UP_TO_10000
      })
      worksheet = await render(JANUARY_TO_MARCH_2026, register)
    })

    it('counts each month, material and band as the outstanding returns route serves them', async () => {
      await expectTheServedCounts(worksheet, JANUARY_TO_MARCH_2026, register)
    })

    it('counts a return from the month after the last one submitted', () => {
      expect(worksheet.getCell('A22').value).toBe('Plastic')
      expect(worksheet.getCell('A26').value).toBe('Over 10,000 tonnes')
      expect(worksheet.getCell('B26').value).toBe(0)
      expect(worksheet.getCell('E26').value).toBe(1)
      expect(worksheet.getCell('H26').value).toBe(1)
    })

    it('leaves out each material with no accredited operator in the period', () => {
      expect(worksheet.getCell('A8').value).toBe('Glass other')
      expect(worksheet.getCell('A15').value).toBe('Paper and board')
      expect(worksheet.getCell('A29').value).toBe('Steel')
      expect(worksheet.getCell('A35').value).toBeNull()
    })
  })

  it('gives a material beyond the published ones a block after them, at zero where nothing is outstanding', async () => {
    const register = emptyRegister()
    await seedOperator(register, {
      material: MATERIAL.FIBRE,
      tonnageBand: TONNAGE_BAND.UP_TO_500,
      submitted: [1, 2, 3]
    })
    await seedOperator(register, {
      material: MATERIAL.WOOD,
      tonnageBand: TONNAGE_BAND.UP_TO_500
    })

    const worksheet = await render(JANUARY_TO_MARCH_2026, register)

    expect(worksheet.getCell('A8').value).toBe('Wood')
    expect(worksheet.getCell('A15').value).toBe('Fibre-based composite')
    await expectTheServedCounts(worksheet, JANUARY_TO_MARCH_2026, register)
  })

  it('gives a material a block for an accredited operator in any UK nation', async () => {
    const register = emptyRegister()
    await seedOperator(register, {
      material: MATERIAL.WOOD,
      tonnageBand: TONNAGE_BAND.UP_TO_500,
      regulator: REGULATOR.SEPA
    })

    const worksheet = await render(JANUARY_TO_MARCH_2026, register)

    expect(worksheet.getCell('A8').value).toBe('Wood')
    expect(worksheet.getCell('B9').value).toBe(1)
  })
})

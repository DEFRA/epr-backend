import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import {
  ACCREDITATION_STATUS,
  MATERIAL,
  REGULATOR,
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { readMarketInsightsFigures } from '#market-insights/application/read-figures.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import {
  insertAccreditedOperator,
  storedMaterial
} from '#vite/helpers/insert-accredited-operator.js'
import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { partialMock } from '#test/type-helpers.js'
import { frameOf } from './cells.js'
import { addNationFigures } from './nation-figures-tab.js'
import {
  itMatchesThePublishedTab,
  JANUARY_TO_JUNE_2026,
  PUBLISHED_EXTRACTION,
  readParamsFor,
  renderTab
} from './published-workbook-test-helpers.js'

/** @import ExcelJS from 'exceljs' */
/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { Material, RegulatorValue } from '#domain/organisations/model.js' */
/** @import { OrganisationsRepository } from '#repositories/organisations/port.js' */
/** @import { CreateReportParams, ReportsRepository } from '#reports/repository/port.js' */
/** @import { AccreditedFor } from '#vite/helpers/insert-accredited-operator.js' */
/** @import { TabContents } from './cells.js' */

const JANUARY_TO_MARCH_2026 = ['2026-01', '2026-02', '2026-03'].map(toYearMonth)

/**
 * @param {string} name
 * @param {TabContents} contents
 */
const renderWith = (name, contents) =>
  renderTab((workbook) => addNationFigures(workbook, name, contents))

const approvedHistory = [
  { status: ACCREDITATION_STATUS.CREATED, updatedAt: '2025-11-01' },
  { status: ACCREDITATION_STATUS.APPROVED, updatedAt: '2025-12-01' }
]

/**
 * An exporter accredited for the rest of 2026. The organisations fixture
 * approves only reprocessors, so an exporter is built here for a register to
 * start with.
 *
 * @param {{ material: Material, regulator?: RegulatorValue, validFrom?: string }} options
 */
const accreditedExporter = ({
  material,
  regulator = REGULATOR.EA,
  validFrom = '2026-01-01'
}) => {
  const accredited = {
    ...storedMaterial(material),
    wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
    submittedToRegulator: regulator,
    statusHistory: approvedHistory
  }
  const accreditation = buildAccreditation({
    ...accredited,
    validFrom,
    validTo: '2026-12-31'
  })
  const registration = buildRegistration({
    ...accredited,
    accreditationId: accreditation.id
  })
  const organisation = buildOrganisation({
    registrations: [registration],
    accreditations: [accreditation]
  })
  return {
    organisation,
    operator: {
      organisationId: organisation.id,
      registrationId: registration.id
    }
  }
}

/**
 * @typedef {Object} Register
 * @property {OrganisationsRepository} organisationsRepository
 * @property {ReportsRepository} reportsRepository
 */

/**
 * A register holding the given exporters and nothing else.
 *
 * @param {ReturnType<typeof accreditedExporter>[]} [exporters]
 * @returns {Register}
 */
const newRegister = (exporters = []) => ({
  organisationsRepository: createInMemoryOrganisationsRepository(
    exporters.map(({ organisation }) => partialMock(organisation))
  )(),
  reportsRepository: createInMemoryReportsRepository()()
})

/**
 * Seeds an accredited reprocessor.
 *
 * @param {Register} register
 * @param {AccreditedFor & { regulator?: RegulatorValue }} operator
 */
const seedOperator = (
  { organisationsRepository },
  { regulator, ...accreditedFor }
) => insertAccreditedOperator(organisationsRepository, regulator, accreditedFor)

/**
 * Submits the operator's monthly report for one month of 2026.
 *
 * @param {Register} register
 * @param {{ organisationId: string, registrationId: string }} operator
 * @param {number} period
 * @param {Partial<CreateReportParams>} figures
 */
const submitMonthlyReport = (
  { reportsRepository },
  operator,
  period,
  figures
) =>
  buildSubmittedReport(reportsRepository, {
    ...operator,
    year: 2026,
    cadence: 'monthly',
    period,
    ...figures
  })

/**
 * Seeds an accredited reprocessor for each of the materials the published file
 * lists.
 *
 * @param {Register} register
 */
const seedPublishedMaterialOperators = async (register) => {
  for (const material of TONNAGE_MONITORING_MATERIALS) {
    if (material !== MATERIAL.FIBRE) {
      await seedOperator(register, { material })
    }
  }
}

/**
 * The tab's contents for the months, read from the register.
 *
 * @param {Register} register
 * @param {YearMonth[]} [months]
 * @returns {Promise<TabContents>}
 */
const contentsOfRegister = async (
  register,
  months = JANUARY_TO_MARCH_2026
) => ({
  ...frameOf({ months, now: PUBLISHED_EXTRACTION }),
  figures: await readMarketInsightsFigures({
    ...readParamsFor(months),
    ...register
  })
})

/**
 * The tab for the months, with nothing reported by an accredited operator for
 * each of the published file's materials.
 *
 * @param {string} name
 * @param {YearMonth[]} months
 */
const render = async (name, months) => {
  const register = newRegister()
  await seedPublishedMaterialOperators(register)
  return renderWith(name, await contentsOfRegister(register, months))
}

/**
 * The values of a block of cells, row by row.
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @param {string} topLeft - e.g. 'B5'
 * @param {string} bottomRight - e.g. 'H12'
 */
const valuesIn = (worksheet, topLeft, bottomRight) => {
  const first = worksheet.getCell(topLeft).fullAddress
  const last = worksheet.getCell(bottomRight).fullAddress
  return Array.from({ length: last.row - first.row + 1 }, (_, rowOffset) =>
    Array.from(
      { length: last.col - first.col + 1 },
      (_, colOffset) =>
        worksheet.getCell(first.row + rowOffset, first.col + colOffset).value
    )
  )
}

describe.each([WORKSHEET_NAME.UK, WORKSHEET_NAME.ENGLAND])(
  'the %j tab',
  (name) => {
    itMatchesThePublishedTab(name, () => render(name, JANUARY_TO_JUNE_2026))
  }
)

describe('a UK or England tab', () => {
  it('lays each month out after the last, however long the period', async () => {
    const worksheet = await render(WORKSHEET_NAME.UK, JANUARY_TO_MARCH_2026)

    expect(worksheet.getCell('A48').value).toBe('March 2026')
    expect(worksheet.getCell('A71').value).toBe('January 2026')
    expect(worksheet.getCell('A72').value).toBe('Reprocessor PRN Data ')
    expect(worksheet.getCell('A117').value).toBe('March 2026')
    expect(worksheet.rowCount).toBe(138)
  })
})

describe("the UK tab's figures", () => {
  const paperExporter = accreditedExporter({
    material: MATERIAL.PAPER,
    regulator: REGULATOR.SEPA
  })
  const register = newRegister([paperExporter])

  /** @type {ExcelJS.Worksheet} */
  let worksheet

  beforeAll(async () => {
    await seedPublishedMaterialOperators(register)
    const plasticReprocessor = await seedOperator(register, {
      material: MATERIAL.PLASTIC
    })
    await submitMonthlyReport(register, plasticReprocessor, 2, {
      recyclingActivity: {
        suppliers: [],
        totalTonnageReceived: 101.25,
        tonnageRecycled: 102,
        tonnageNotRecycled: 103
      },
      wasteSent: {
        tonnageSentToReprocessor: 104,
        tonnageSentToExporter: 105,
        tonnageSentToAnotherSite: 106,
        finalDestinations: []
      },
      prn: {
        issuedTonnage: 110,
        freeTonnage: 10,
        totalRevenue: 5000,
        averagePricePerTonne: 45.45
      }
    })
    await submitMonthlyReport(register, paperExporter.operator, 1, {
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
      material: MATERIAL.PAPER,
      recyclingActivity: {
        suppliers: [],
        totalTonnageReceived: 201,
        tonnageRecycled: null,
        tonnageNotRecycled: null
      },
      exportActivity: {
        overseasSites: [],
        unapprovedOverseasSites: [],
        totalTonnageExported: 202,
        tonnageReceivedNotExported: 203,
        tonnageStoppedDuringExport: 207,
        tonnageRefusedAtDestination: 208,
        totalTonnageRefusedOrStopped: 415,
        tonnageRepatriated: 209
      },
      wasteSent: {
        tonnageSentToReprocessor: 204,
        tonnageSentToExporter: 205,
        tonnageSentToAnotherSite: 206,
        finalDestinations: []
      },
      prn: {
        issuedTonnage: 300,
        freeTonnage: 0,
        totalRevenue: 7500.5,
        averagePricePerTonne: 25
      }
    })
    worksheet = await renderWith(
      WORKSHEET_NAME.UK,
      await contentsOfRegister(register)
    )
  })

  it("fills a month's reprocessor table with every material's tonnages and their grand total", () => {
    const nothing = [0, 0, 0, 0, 0, 0, 0]
    const plastic = [101.25, 102, 103, 315, 104, 105, 106]

    // February's reprocessor table, Aluminium to Grand Total.
    expect(valuesIn(worksheet, 'B28', 'H35')).toEqual([
      nothing,
      nothing,
      nothing,
      nothing,
      plastic,
      nothing,
      nothing,
      plastic
    ])
  })

  it("fills a month's exporter table from every regulator's operators", () => {
    const nothing = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const paper = [201, 202, 203, 615, 204, 205, 206, 207, 208, 209]

    // January's exporter table, Aluminium to Grand Total.
    expect(valuesIn(worksheet, 'B16', 'K23')).toEqual([
      nothing,
      nothing,
      nothing,
      paper,
      nothing,
      nothing,
      nothing,
      paper
    ])
  })

  it('fills the PRN table with the revised tonnage, the revenue and the average price, and dashes the grand total average', () => {
    const nothing = [0, 0, 0]

    // February's reprocessor PRN table, Aluminium to Grand Total.
    expect(valuesIn(worksheet, 'B97', 'D104')).toEqual([
      nothing,
      nothing,
      nothing,
      nothing,
      [100, 5000, 50],
      nothing,
      nothing,
      [100, 5000, '-']
    ])
  })

  it('fills the PERN table the same way', () => {
    const nothing = [0, 0, 0]

    // January's exporter PERN table, Aluminium to Grand Total.
    expect(valuesIn(worksheet, 'B85', 'D92')).toEqual([
      nothing,
      nothing,
      nothing,
      [300, 7500.5, 25],
      nothing,
      nothing,
      nothing,
      [300, 7500.5, '-']
    ])
  })

  it("leaves the England tab's figure cells empty", async () => {
    const england = await renderWith(
      WORKSHEET_NAME.ENGLAND,
      await contentsOfRegister(register)
    )
    /** @param {number} width */
    const emptyRows = (width) =>
      Array.from({ length: 8 }, () => Array.from({ length: width }, () => null))

    expect(valuesIn(england, 'B28', 'H35')).toEqual(emptyRows(7))
    expect(valuesIn(england, 'B97', 'D104')).toEqual(emptyRows(3))
  })

  it('sets the grand total average dash as published', () => {
    const { font, alignment } = worksheet.getCell('D104')

    expect(font?.bold).toBe(true)
    expect(alignment?.horizontal).toBe('center')
  })
})

describe("a UK or England tab's materials", () => {
  it('are those the period has an accredited operator for, in published order, with zeros where nothing was reported', async () => {
    const register = newRegister([
      accreditedExporter({ material: MATERIAL.ALUMINIUM })
    ])
    await seedOperator(register, { material: MATERIAL.WOOD })

    const worksheet = await renderWith(
      WORKSHEET_NAME.UK,
      await contentsOfRegister(register)
    )

    expect(valuesIn(worksheet, 'A5', 'D7')).toEqual([
      ['Aluminium', 0, 0, 0],
      ['Wood', 0, 0, 0],
      ['Grand Total', 0, 0, 0]
    ])
  })

  it('take in a material the published file does not list, after those it does', async () => {
    const register = newRegister()
    await seedPublishedMaterialOperators(register)
    const fibreReprocessor = await seedOperator(register, {
      material: MATERIAL.FIBRE
    })
    await submitMonthlyReport(register, fibreReprocessor, 3, {
      material: MATERIAL.FIBRE,
      recyclingActivity: {
        suppliers: [],
        totalTonnageReceived: 42,
        tonnageRecycled: 40,
        tonnageNotRecycled: 2
      }
    })

    const worksheet = await renderWith(
      WORKSHEET_NAME.UK,
      await contentsOfRegister(register)
    )

    expect(valuesIn(worksheet, 'A11', 'A13')).toEqual([
      ['Wood'],
      ['Fibre-based composite'],
      ['Grand Total']
    ])
    // Each table gains a row, so each month's section gains two.
    expect(worksheet.getCell('A27').value).toBe('February 2026')
    expect(worksheet.getCell('A52').value).toBe('March 2026')
    expect(valuesIn(worksheet, 'B62', 'D62')).toEqual([[42, 40, 2]])
    expect(worksheet.rowCount).toBe(150)
  })

  it('include one first accredited in a later month of the period, in every month', async () => {
    const register = newRegister([
      accreditedExporter({
        material: MATERIAL.ALUMINIUM,
        validFrom: '2026-03-01'
      })
    ])

    const worksheet = await renderWith(
      WORKSHEET_NAME.UK,
      await contentsOfRegister(register)
    )

    // January's reprocessor table, then its exporter table.
    expect(valuesIn(worksheet, 'A5', 'A6')).toEqual([
      ['Aluminium'],
      ['Grand Total']
    ])
    expect(valuesIn(worksheet, 'A10', 'A11')).toEqual([
      ['Aluminium'],
      ['Grand Total']
    ])
  })

  it("on the England tab are the UK's, including those of operators outside England", async () => {
    const register = newRegister([
      accreditedExporter({ material: MATERIAL.ALUMINIUM })
    ])
    await seedOperator(register, {
      material: MATERIAL.WOOD,
      regulator: REGULATOR.SEPA
    })

    const worksheet = await renderWith(
      WORKSHEET_NAME.ENGLAND,
      await contentsOfRegister(register)
    )

    expect(valuesIn(worksheet, 'A5', 'A7')).toEqual([
      ['Aluminium'],
      ['Wood'],
      ['Grand Total']
    ])
  })

  it('cannot be chosen without the UK figures', async () => {
    const contents = await contentsOfRegister(newRegister())

    await expect(
      renderWith(WORKSHEET_NAME.ENGLAND, {
        ...contents,
        figures: { ...contents.figures, scopes: [] }
      })
    ).rejects.toThrow('The market insights figures have no uk scope')
  })
})

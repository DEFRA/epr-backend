import { MATERIAL } from '#domain/organisations/model.js'
import { WORKSHEET_NAME } from '#market-insights/domain/published-workbook-text.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createAccreditedOperatorInserter } from '#vite/helpers/insert-accredited-operator.js'
import {
  JANUARY_TO_JUNE_2026,
  readParamsFor,
  readPublishedWorkbook,
  reread,
  sheet
} from './workbook/published-workbook-test-helpers.js'
import { buildMarketInsightsWorkbook } from './build-workbook.js'

/** @import ExcelJS from 'exceljs' */

/**
 * @param {boolean} redacted
 */
const build = async (redacted) =>
  reread(
    await buildMarketInsightsWorkbook({
      ...readParamsFor(JANUARY_TO_JUNE_2026),
      redacted
    })
  )

/**
 * @param {ExcelJS.Workbook} workbook
 */
const namesOf = (workbook) => workbook.worksheets.map(({ name }) => name)

describe('building the published market insights workbook', () => {
  /** @type {ExcelJS.Workbook} */
  let generated

  beforeAll(async () => {
    generated = await build(true)
  })

  it('has the published tabs bar England, in the published order, trailing spaces and all', async () => {
    const published = await readPublishedWorkbook()

    expect(namesOf(generated)).toEqual(
      namesOf(published).filter((name) => name !== WORKSHEET_NAME.ENGLAND)
    )
  })

  it('lays every tab out for the requested period', () => {
    expect(
      sheet(generated, WORKSHEET_NAME.WASTE_BALANCE).getCell('A5').value
    ).toBe(
      'The table below shows the UK credited waste balance for January to June 2026'
    )
  })

  it('shows no gridlines on any tab, so only the tables have borders', () => {
    expect(
      generated.worksheets.map(({ views }) => views[0]?.showGridLines)
    ).toEqual(generated.worksheets.map(() => false))
  })
})

describe("the published market insights workbook's columns", () => {
  it('are widened to show the full text of their tables', async () => {
    const params = readParamsFor(JANUARY_TO_JUNE_2026)
    const { servedOrganisation } = await createAccreditedOperatorInserter(
      createOrganisationBuilders()
    )(createInMemoryOrganisationsRepository()(), undefined, {
      material: MATERIAL.FIBRE
    })
    params.served.add(servedOrganisation)

    const generated = await reread(
      await buildMarketInsightsWorkbook({ ...params, redacted: true })
    )

    expect(
      sheet(generated, WORKSHEET_NAME.UK).getColumn('A').width
    ).toBeGreaterThan('Fibre-based composite'.length)
  })
})

describe('building the full market insights workbook', () => {
  it('keeps the England tab for the regulators, after the UK tab', async () => {
    const full = await build(false)

    expect(namesOf(full).slice(-2)).toEqual([
      WORKSHEET_NAME.UK,
      WORKSHEET_NAME.ENGLAND
    ])
  })
})

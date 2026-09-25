import { assert } from 'vitest'
import {
  WASTE_BALANCE_ACCREDITATION_TYPES,
  WASTE_BALANCE_MATERIALS,
  WORKSHEET_NAME
} from '#market-insights/domain/published-workbook-text.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { MATERIAL, REGULATOR } from '#domain/organisations/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { insertAccreditedOperator } from '#vite/helpers/insert-accredited-operator.js'
import { buildWasteBalanceTable } from '#market-insights/application/waste-balance-table.js'
import { readMarketInsightsFigures } from '#market-insights/application/read-figures.js'
import { assertPresent, partialMock } from '#test/type-helpers.js'
import { frameOf } from './cells.js'
import { addWasteBalance } from './waste-balance-tab.js'
import {
  itMatchesThePublishedTab,
  JANUARY_TO_JUNE_2026,
  PUBLISHED_EXTRACTION,
  readParamsFor,
  renderTab
} from './published-workbook-test-helpers.js'

/** @import ExcelJS from 'exceljs' */
/** @import { YearMonth } from '#common/helpers/dates/year-month.js' */
/** @import { Material } from '#domain/organisations/model.js' */
/** @import { ReadMarketInsightsFiguresParams } from '#market-insights/application/read-figures.js' */

const JANUARY_TO_MARCH_2026 = ['2026-01', '2026-02', '2026-03'].map(toYearMonth)

const HEADING_ROW = 9
const FIRST_FIGURE_COLUMN = 3

/**
 * @typedef {Pick<ReadMarketInsightsFiguresParams,
 *   'ledgerRepository' | 'summaryLogRowStatesRepository' | 'organisationsRepository' | 'overseasSitesRepository' | 'reportsRepository'
 * >} Register
 */

/** @returns {Register} */
const emptyRegister = () => {
  const {
    ledgerRepository,
    summaryLogRowStatesRepository,
    organisationsRepository,
    overseasSitesRepository,
    reportsRepository
  } = readParamsFor([])
  return {
    ledgerRepository,
    summaryLogRowStatesRepository,
    organisationsRepository,
    overseasSitesRepository,
    reportsRepository
  }
}

const STAMPED_EXCLUDED = {
  outcome: WASTE_BALANCE_OUTCOME.EXCLUDED,
  reasons: [],
  transactionAmount: 0
}

/**
 * A received load complete enough for the waste balance to credit it.
 *
 * @param {string} rowId
 * @param {string} date
 * @param {number} tonnage
 */
const receivedRow = (rowId, date, tonnage) => ({
  rowId,
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: {
    DATE_RECEIVED_FOR_REPROCESSING: date,
    EWC_CODE: '15 01 02',
    DESCRIPTION_WASTE: 'Packaging',
    WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
    GROSS_WEIGHT: tonnage + 1,
    TARE_WEIGHT: 1,
    PALLET_WEIGHT: 0,
    NET_WEIGHT: tonnage,
    BAILING_WIRE_PROTOCOL: 'No',
    HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Sampling',
    WEIGHT_OF_NON_TARGET_MATERIALS: 0,
    RECYCLABLE_PROPORTION_PERCENTAGE: 100,
    TONNAGE_RECEIVED_FOR_RECYCLING: tonnage
  },
  classification: STAMPED_EXCLUDED
})

/**
 * @param {string} rowId
 * @param {string} date
 * @param {number} tonnage
 */
const sentOnRow = (rowId, date, tonnage) => ({
  rowId,
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
  data: {
    DATE_LOAD_LEFT_SITE: date,
    TONNAGE_OF_UK_PACKAGING_WASTE_SENT_ON: tonnage
  },
  classification: STAMPED_EXCLUDED
})

/**
 * An accredited reprocessor, which has submitted a summary log of the rows
 * given.
 *
 * @param {Register} register
 * @param {{ material: Material, rows?: ReturnType<typeof receivedRow | typeof sentOnRow>[] }} operator
 */
const seedOperator = async (
  { organisationsRepository, summaryLogRowStatesRepository, ledgerRepository },
  { material, rows = [] }
) => {
  const operator = await insertAccreditedOperator(
    organisationsRepository,
    REGULATOR.EA,
    { material }
  )
  const { registrations } = await organisationsRepository.findById(
    operator.organisationId
  )
  const accreditationId = registrations.find(
    ({ id }) => id === operator.registrationId
  )?.accreditationId
  assertPresent(accreditationId)
  const ledgerId = { ...operator, accreditationId }
  const summaryLogId = `log-${operator.registrationId}`

  await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
    ledgerId,
    rows,
    summaryLogId
  )
  await ledgerRepository.appendEvents([
    partialMock(
      buildLedgerEvent({
        ...ledgerId,
        number: 1,
        payload: { summaryLogId, creditTotal: 0 }
      })
    )
  ])
}

/**
 * A register with an accredited operator for each material the published file
 * shows, and none for fibre-based composite.
 */
const publishedRegister = async () => {
  const register = emptyRegister()
  for (const [material] of WASTE_BALANCE_MATERIALS) {
    if (material !== MATERIAL.FIBRE) {
      await seedOperator(register, { material })
    }
  }
  return register
}

/**
 * @param {YearMonth[]} months
 * @param {Register} register
 */
const render = async (months, register) => {
  const contents = {
    ...frameOf({ months, now: PUBLISHED_EXTRACTION }),
    figures: await readMarketInsightsFigures({
      ...readParamsFor(months),
      ...register
    })
  }
  return renderTab((workbook) => addWasteBalance(workbook, contents))
}

/**
 * The published tab as this tab is built until glass-other is amalgamated:
 * glass-other split by accreditation type like every other material, and a
 * note that says nothing of it.
 *
 * @param {ExcelJS.Worksheet} published
 */
const withGlassOtherSplit = (published) => {
  const note = published.getCell('A1')
  const { value } = note
  assert(value !== null && typeof value === 'object' && 'richText' in value)
  const { richText } = value
  const glassOtherSentence = richText.at(-1)
  expect(glassOtherSentence?.text).toBe(
    '\nData for ‘glass-other’ has not been split by accreditation type to protect commercial data for identifiable operators.'
  )
  const withoutIt = richText.slice(0, -1)
  const last = withoutIt.at(-1)
  assertPresent(last)
  note.value = {
    richText: [
      ...withoutIt.slice(0, -1),
      { ...last, text: last.text.trimEnd() }
    ]
  }

  expect(published.getCell('B12').value).toBe('Exp & Rep')
  published.duplicateRow(12, 1, true)
  published.getCell('B12').value = 'Exporter'
  published.getCell('B13').value = 'Reprocessor'
}

/**
 * The labels of every row under the headings.
 *
 * @param {ExcelJS.Worksheet} worksheet
 */
const rowLabels = (worksheet) => {
  /** @type {ExcelJS.CellValue[][]} */
  const labels = []
  for (
    let row = HEADING_ROW + 1;
    worksheet.getCell(row, 1).value !== null;
    row++
  ) {
    labels.push([
      worksheet.getCell(row, 1).value,
      worksheet.getCell(row, 2).value
    ])
  }
  return labels
}

/**
 * The figures of the row with the given labels, each month then the total.
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @param {YearMonth[]} months
 * @param {[string, string]} labels
 */
const figuresOfRow = (worksheet, months, [material, type]) => {
  const index = rowLabels(worksheet).findIndex(
    ([materialLabel, typeLabel]) =>
      materialLabel === material && typeLabel === type
  )
  expect(index).not.toBe(-1)
  return Array.from(
    { length: months.length + 1 },
    (_, column) =>
      worksheet.getCell(HEADING_ROW + 1 + index, FIRST_FIGURE_COLUMN + column)
        .value
  )
}

/**
 * Asserts every row of the tab shows the net credit the waste balance route
 * serves for its material and accreditation type, each month then the period.
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @param {YearMonth[]} months
 * @param {Register} register
 */
const expectTheServedFigures = async (worksheet, months, register) => {
  const served = await buildWasteBalanceTable({
    ...readParamsFor(months),
    ...register
  })
  const materialLabelled = new Map(
    WASTE_BALANCE_MATERIALS.map(([material, label]) => [label, material])
  )
  const typeLabelled = new Map(
    WASTE_BALANCE_ACCREDITATION_TYPES.map(([type, label]) => [label, type])
  )
  const labels = rowLabels(worksheet)
  expect(labels).not.toHaveLength(0)

  for (const [materialLabel, typeLabel] of labels) {
    const material = materialLabelled.get(String(materialLabel))
    const type = typeLabelled.get(String(typeLabel))
    assertPresent(material)
    assertPresent(type)
    expect(
      figuresOfRow(worksheet, months, [
        String(materialLabel),
        String(typeLabel)
      ])
    ).toEqual([
      ...months.map(
        (month) => served.data.months[month].figures[material][type].netCredit
      ),
      served.data.period.figures[material][type].netCredit
    ])
  }
}

describe('the waste balance tab', () => {
  itMatchesThePublishedTab(
    WORKSHEET_NAME.WASTE_BALANCE,
    async () => render(JANUARY_TO_JUNE_2026, await publishedRegister()),
    withGlassOtherSplit
  )

  it('links the note to its GOV.UK page', async () => {
    const worksheet = await render(JANUARY_TO_JUNE_2026, emptyRegister())

    expect(worksheet.getCell('A1').hyperlink).toBe(
      'https://www.gov.uk/government/publications/packaging-waste-data-reported-by-reprocessors-and-exporters'
    )
  })

  it('puts the total after the last month, however long the period', async () => {
    const worksheet = await render(JANUARY_TO_MARCH_2026, emptyRegister())

    expect(worksheet.getCell('F9').value).toBe('Total')
  })

  describe('over a register with net credit', () => {
    /** @type {Register} */
    let register
    /** @type {ExcelJS.Worksheet} */
    let worksheet

    beforeAll(async () => {
      register = emptyRegister()
      await seedOperator(register, {
        material: MATERIAL.PLASTIC,
        rows: [
          receivedRow('row-1', '2026-02-10', 40.25),
          receivedRow('row-2', '2026-03-10', 100.5),
          sentOnRow('row-3', '2026-03-25', 30.1)
        ]
      })
      await seedOperator(register, {
        material: 'glass_other',
        rows: [receivedRow('row-1', '2026-01-15', 12)]
      })
      worksheet = await render(JANUARY_TO_MARCH_2026, register)
    })

    it('prints each net credit and total as the waste balance route serves them', async () => {
      await expectTheServedFigures(worksheet, JANUARY_TO_MARCH_2026, register)
    })

    it('prints the net credit of each month, then of the period', () => {
      expect(
        figuresOfRow(worksheet, JANUARY_TO_MARCH_2026, [
          'Plastic',
          'Reprocessor'
        ])
      ).toEqual([0, 40.25, 70.4, 110.65])
    })

    it('splits glass-other by accreditation type', () => {
      expect(
        figuresOfRow(worksheet, JANUARY_TO_MARCH_2026, [
          'Glass-other',
          'Reprocessor'
        ])
      ).toEqual([12, 0, 0, 12])
      expect(
        figuresOfRow(worksheet, JANUARY_TO_MARCH_2026, [
          'Glass-other',
          'Exporter'
        ])
      ).toEqual([0, 0, 0, 0])
    })

    it('sets the figures as whole tonnes', () => {
      expect(worksheet.getCell('D13').numFmt).toBe('#,##0')
      expect(worksheet.getCell('F13').numFmt).toBe('#,##0')
    })
  })

  it('lists only the materials the period has an accredited operator for, each accreditation type at zero where nothing was reported', async () => {
    const register = emptyRegister()
    await seedOperator(register, { material: MATERIAL.WOOD })
    await seedOperator(register, { material: MATERIAL.ALUMINIUM })

    const worksheet = await render(JANUARY_TO_MARCH_2026, register)

    expect(rowLabels(worksheet)).toEqual([
      ['Aluminium', 'Exporter'],
      ['Aluminium', 'Reprocessor'],
      ['Wood', 'Exporter'],
      ['Wood', 'Reprocessor']
    ])
    await expectTheServedFigures(worksheet, JANUARY_TO_MARCH_2026, register)
  })

  it('lists a material the published file does not, after those it does', async () => {
    const register = emptyRegister()
    await seedOperator(register, {
      material: MATERIAL.FIBRE,
      rows: [receivedRow('row-1', '2026-02-10', 7)]
    })
    await seedOperator(register, { material: MATERIAL.WOOD })

    const worksheet = await render(JANUARY_TO_MARCH_2026, register)

    expect(rowLabels(worksheet)).toEqual([
      ['Wood', 'Exporter'],
      ['Wood', 'Reprocessor'],
      ['Fibre-based composite', 'Exporter'],
      ['Fibre-based composite', 'Reprocessor']
    ])
    expect(
      figuresOfRow(worksheet, JANUARY_TO_MARCH_2026, [
        'Fibre-based composite',
        'Reprocessor'
      ])
    ).toEqual([0, 7, 0, 7])
  })
})

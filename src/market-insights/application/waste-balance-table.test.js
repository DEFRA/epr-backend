import { describe, it, expect, vi } from 'vitest'
import {
  ACCREDITATION_STATUS,
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  REPROCESSING_TYPE,
  TONNAGE_MONITORING_MATERIALS,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { buildUnsubmittedReport } from '#vite/helpers/build-unsubmitted-report.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { partialMock } from '#test/type-helpers.js'
import { buildWasteBalanceTable } from './waste-balance-table.js'

// .vite/setup-files.js configures 999999 as a test organisation.
const TEST_ORG_ID = 999999

const NOW = new Date('2026-07-15T12:00:00.000Z')

const JANUARY_TO_JUNE_2026 = [
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06'
]

const ACCREDITED_FROM = '2026-01-01'
const ACCREDITED_TO = '2026-12-31'

const approvedHistory = [
  { status: ACCREDITATION_STATUS.CREATED, updatedAt: '2025-11-01' },
  { status: ACCREDITATION_STATUS.APPROVED, updatedAt: '2025-12-01' }
]

/**
 * A 24-hex id the reports store accepts, distinct per prefix and operator.
 *
 * @param {string} prefix - one hex character
 * @param {number} orgId
 */
const objectIdFor = (prefix, orgId) => `${prefix}${orgId}`.padStart(24, '0')

/**
 * An accredited operator with one registration, plus the ledger entry naming
 * the summary log it last submitted.
 *
 * @param {{
 *   orgId: number,
 *   material?: string,
 *   glassRecyclingProcess?: string[],
 *   wasteProcessingType?: string,
 *   reprocessingType?: string,
 *   overseasSites?: Record<string, { overseasSiteId: string }>,
 *   validFrom?: string,
 *   validTo?: string
 * }} options
 */
const makeOperator = ({
  orgId,
  material = MATERIAL.PLASTIC,
  glassRecyclingProcess,
  wasteProcessingType = WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType = REPROCESSING_TYPE.INPUT,
  overseasSites,
  validFrom = ACCREDITED_FROM,
  validTo = ACCREDITED_TO
}) => {
  const id = objectIdFor('a', orgId)
  const registrationId = objectIdFor('b', orgId)
  const accreditationId = `acc-${orgId}`

  return {
    organisation: {
      id,
      orgId,
      statusHistory: approvedHistory,
      registrations: [
        {
          id: registrationId,
          accreditationId,
          statusHistory: approvedHistory,
          material,
          glassRecyclingProcess,
          wasteProcessingType,
          reprocessingType,
          overseasSites
        }
      ],
      accreditations: [
        {
          id: accreditationId,
          accreditationNumber: `ACC-${orgId}`,
          status: 'approved',
          statusHistory: approvedHistory,
          validFrom,
          validTo,
          material,
          wasteProcessingType,
          reprocessingType
        }
      ]
    },
    ledgerId: { organisationId: id, registrationId, accreditationId },
    summaryLogId: `log-${orgId}`
  }
}

const STAMPED_EXCLUDED = {
  outcome: WASTE_BALANCE_OUTCOME.EXCLUDED,
  reasons: [],
  transactionAmount: 0
}

/**
 * A received load carrying every field the waste-balance classifier reads, so
 * it classifies from its own content. Its stamped classification says the row
 * counts for nothing, so a table reading the stamp instead of re-deriving
 * cannot produce the expected figures.
 */
const receivedRow = (rowId, date, tonnage) => ({
  rowId,
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: {
    DATE_RECEIVED_FOR_REPROCESSING: date,
    EWC_CODE: '15 01 02',
    DESCRIPTION_WASTE: 'Plastic packaging',
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
 * An exported load, likewise complete. The publication buckets it by the date
 * the overseas reprocessor received it.
 */
const exportedRow = (rowId, dateReceivedByOsr, tonnage) => ({
  ...receivedRow(rowId, dateReceivedByOsr, tonnage),
  processingType: PROCESSING_TYPES.EXPORTER,
  wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
  data: {
    DATE_RECEIVED_FOR_EXPORT: '2026-01-05',
    EWC_CODE: '15 01 02',
    DESCRIPTION_WASTE: 'Plastic packaging',
    WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
    GROSS_WEIGHT: tonnage + 1,
    TARE_WEIGHT: 1,
    PALLET_WEIGHT: 0,
    NET_WEIGHT: tonnage,
    BAILING_WIRE_PROTOCOL: 'No',
    HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Sampling',
    WEIGHT_OF_NON_TARGET_MATERIALS: 0,
    RECYCLABLE_PROPORTION_PERCENTAGE: 100,
    TONNAGE_RECEIVED_FOR_EXPORT: tonnage,
    TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: tonnage,
    DATE_OF_EXPORT: '2026-01-20',
    BASEL_EXPORT_CODE: 'B3010',
    CUSTOMS_CODES: '391510',
    CONTAINER_NUMBER: 'CN-001',
    DATE_RECEIVED_BY_OSR: dateReceivedByOsr,
    OSR_ID: '099',
    DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No'
  }
})

const approvedOverseasSite = {
  id: 'site-1',
  name: 'Site 1',
  address: { line1: '1 Dock Road', townOrCity: 'Rotterdam' },
  country: 'Netherlands',
  createdAt: new Date('2025-01-01T00:00:00.000Z'),
  updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  validFrom: new Date('2026-01-01T00:00:00.000Z')
}

/**
 * A processed load. The reprocessor-input accreditation reports one but does
 * not credit it — its `processed` table is supplementary.
 */
const processedRow = (rowId, date, tonnage) => ({
  rowId,
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
  data: {
    DATE_LOAD_LEFT_SITE: date,
    PRODUCT_UK_PACKAGING_WEIGHT_PROPORTION: tonnage
  },
  classification: STAMPED_EXCLUDED
})

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
 * The same operator holding only a registration, so it reports quarterly and
 * publishes nothing.
 *
 * @param {ReturnType<typeof makeOperator>} operator
 */
const registeredOnly = ({ organisation }) => ({
  ...organisation,
  registrations: organisation.registrations.map((registration) => ({
    ...registration,
    accreditationId: null
  })),
  accreditations: []
})

/**
 * @typedef {Pick<import('#reports/repository/port.js').CreateReportParams, 'organisationId' | 'registrationId' | 'year' | 'cadence' | 'period'>} MonthlyReportRef
 */

/**
 * The same operator with its accreditation cancelled on the given day. The
 * validity window is kept, as a cancellation leaves it.
 *
 * @param {ReturnType<typeof makeOperator>} operator
 * @param {string} cancelledOn - `YYYY-MM-DD`
 */
const cancelledOn = ({ organisation }, cancelledOn) => ({
  ...organisation,
  accreditations: organisation.accreditations.map((accreditation) => ({
    ...accreditation,
    status: ACCREDITATION_STATUS.CANCELLED,
    statusHistory: [
      ...accreditation.statusHistory,
      { status: ACCREDITATION_STATUS.SUSPENDED, updatedAt: cancelledOn },
      {
        status: ACCREDITATION_STATUS.CANCELLED,
        updatedAt: `${cancelledOn}T09:00:00.000Z`
      }
    ]
  }))
})

/**
 * The same operator whose accreditation was never granted, so it holds no
 * validity window.
 *
 * @param {ReturnType<typeof makeOperator>} operator
 */
const neverAccredited = ({ organisation }) => ({
  ...organisation,
  accreditations: organisation.accreditations.map(
    ({ validFrom: _validFrom, validTo: _validTo, ...accreditation }) => ({
      ...accreditation,
      status: ACCREDITATION_STATUS.CREATED,
      statusHistory: [approvedHistory[0]]
    })
  )
})

/**
 * The same operator whose approval was reverted, which leaves the validity
 * window on the record.
 *
 * @param {ReturnType<typeof makeOperator>} operator
 */
const approvalReverted = ({ organisation }) => ({
  ...organisation,
  accreditations: organisation.accreditations.map((accreditation) => ({
    ...accreditation,
    status: ACCREDITATION_STATUS.CREATED,
    statusHistory: [
      ...accreditation.statusHistory,
      { status: ACCREDITATION_STATUS.CREATED, updatedAt: '2026-02-01' }
    ]
  }))
})

/**
 * The monthly report an operator submitted for one period of 2026.
 *
 * @param {ReturnType<typeof makeOperator>} operator
 * @param {number} period
 * @returns {MonthlyReportRef}
 */
const monthlyReport = ({ ledgerId }, period) => ({
  organisationId: ledgerId.organisationId,
  registrationId: ledgerId.registrationId,
  year: 2026,
  cadence: 'monthly',
  period
})

/**
 * Run the aggregation over in-memory adapters seeded with the given
 * submissions. Each submission names the ledger partition that wrote it, so a
 * test can put two partitions behind one summary log.
 *
 * @param {{
 *   organisations: any[],
 *   submissions: any[],
 *   reports?: MonthlyReportRef[],
 *   unsubmittedReports?: MonthlyReportRef[],
 *   overseasSites?: import('#overseas-sites/repository/port.js').OverseasSite[],
 *   months?: string[],
 *   now?: Date
 * }} options
 */
const run = async ({
  organisations,
  submissions,
  reports = [],
  unsubmittedReports = [],
  overseasSites = [],
  months = JANUARY_TO_JUNE_2026,
  now = NOW
}) => {
  const reportsRepository = createInMemoryReportsRepository()()
  for (const report of reports) {
    await buildSubmittedReport(reportsRepository, report)
  }
  for (const report of unsubmittedReports) {
    await buildUnsubmittedReport(reportsRepository, report)
  }

  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStatesRepository()()

  for (const { ledgerId, summaryLogId, rows } of submissions) {
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      ledgerId,
      rows,
      summaryLogId
    )
  }

  const ledgerRepository = createInMemoryLedgerRepository(
    submissions.map(({ ledgerId, summaryLogId }, index) =>
      partialMock(
        buildLedgerEvent({
          ...ledgerId,
          number: index + 1,
          payload: { summaryLogId, creditTotal: 0 }
        })
      )
    )
  )()

  const logger = { info: vi.fn(), warn: vi.fn() }

  const table = await buildWasteBalanceTable({
    ledgerRepository,
    summaryLogRowStatesRepository,
    organisationsRepository: createInMemoryOrganisationsRepository(
      organisations.map((organisation) => partialMock(organisation))
    )(),
    overseasSitesRepository:
      createInMemoryOverseasSitesRepository(overseasSites)(),
    reportsRepository,
    logger: partialMock(logger),
    months,
    now
  })

  return { table, logger }
}

/** @type {import('#market-insights/domain/waste-balance-figures.js').PublishedWasteBalanceFigures} */
const NO_ACTIVITY = {
  totalCredited: 0,
  eligibleForWasteBalance: 0,
  sentOnDeductions: 0,
  netCredit: 0
}

/**
 * The rows something was reported into. The table carries a zero row for
 * every other combination, which these tests are not about.
 *
 * @param {import('./waste-balance-table.js').WasteBalanceTable} table
 */
const reported = (table) =>
  table.data.filter(
    (row) => row.totalCredited !== 0 || row.sentOnDeductions !== 0
  )

describe('buildWasteBalanceTable', () => {
  it('stamps the clock it was given', async () => {
    const { table } = await run({ organisations: [], submissions: [] })

    expect(table.meta).toStrictEqual({
      generatedAt: NOW.toISOString(),
      monthlyReports: {
        byMonth: JANUARY_TO_JUNE_2026.map((month) => ({
          month,
          expected: 0,
          submitted: 0
        })),
        total: { expected: 0, submitted: 0 }
      }
    })
  })

  describe('the monthly reports the figures include', () => {
    const sum = (/** @type {number[]} */ counts) =>
      counts.reduce((total, count) => total + count, 0)

    /**
     * One pair of counts per month of the first half of 2026, and their sum.
     *
     * @param {number[]} expected
     * @param {number[]} submitted
     */
    const perMonth = (expected, submitted) => ({
      byMonth: JANUARY_TO_JUNE_2026.map((month, i) => ({
        month,
        expected: expected[i],
        submitted: submitted[i]
      })),
      total: { expected: sum(expected), submitted: sum(submitted) }
    })

    it('expects one report per accredited registration for every month served', async () => {
      const first = makeOperator({ orgId: 500020 })
      const second = makeOperator({ orgId: 500021 })

      const { table } = await run({
        organisations: [first.organisation, second.organisation],
        submissions: []
      })

      expect(table.meta.monthlyReports).toEqual(
        perMonth([2, 2, 2, 2, 2, 2], [0, 0, 0, 0, 0, 0])
      )
    })

    it('counts the reports that were submitted', async () => {
      const operator = makeOperator({ orgId: 500022 })

      const { table } = await run({
        organisations: [operator.organisation],
        submissions: [],
        reports: [monthlyReport(operator, 1), monthlyReport(operator, 2)]
      })

      expect(table.meta.monthlyReports).toEqual(
        perMonth([1, 1, 1, 1, 1, 1], [1, 1, 0, 0, 0, 0])
      )
    })

    it('still counts a report that was submitted and then unsubmitted, as the public register does', async () => {
      const operator = makeOperator({ orgId: 500026 })

      const { table } = await run({
        organisations: [operator.organisation],
        submissions: [],
        unsubmittedReports: [monthlyReport(operator, 1)]
      })

      expect(table.meta.monthlyReports).toEqual(
        perMonth([1, 1, 1, 1, 1, 1], [1, 0, 0, 0, 0, 0])
      )
    })

    it('counts every month served, including one UTC has not yet left', async () => {
      const operator = makeOperator({ orgId: 500027 })

      const { table } = await run({
        organisations: [operator.organisation],
        submissions: [],
        now: new Date('2026-06-30T23:30:00.000Z')
      })

      expect(table.meta.monthlyReports).toEqual(
        perMonth([1, 1, 1, 1, 1, 1], [0, 0, 0, 0, 0, 0])
      )
    })

    it('expects reports only from the month the accreditation began', async () => {
      const operator = makeOperator({
        orgId: 500023,
        validFrom: '2026-05-01',
        validTo: '2026-12-31'
      })

      const { table } = await run({
        organisations: [operator.organisation],
        submissions: []
      })

      expect(table.meta.monthlyReports).toEqual(
        perMonth([0, 0, 0, 0, 1, 1], [0, 0, 0, 0, 0, 0])
      )
    })

    it('expects no report after the accreditation ends', async () => {
      const operator = makeOperator({
        orgId: 500026,
        validFrom: '2026-01-01',
        validTo: '2026-03-31'
      })

      const { table } = await run({
        organisations: [operator.organisation],
        submissions: []
      })

      expect(table.meta.monthlyReports).toEqual(
        perMonth([1, 1, 1, 0, 0, 0], [0, 0, 0, 0, 0, 0])
      )
    })

    it('expects reports up to the month the accreditation was cancelled, and counts those it filed', async () => {
      const operator = makeOperator({ orgId: 500027 })

      const { table } = await run({
        organisations: [cancelledOn(operator, '2026-03-20')],
        submissions: [],
        reports: [monthlyReport(operator, 1), monthlyReport(operator, 4)]
      })

      expect(table.meta.monthlyReports).toEqual(
        perMonth([1, 1, 1, 0, 0, 0], [1, 0, 0, 0, 0, 0])
      )
    })

    it('expects nothing of an accreditation whose approval was reverted', async () => {
      const operator = makeOperator({ orgId: 500029 })

      const { table } = await run({
        organisations: [approvalReverted(operator)],
        submissions: []
      })

      expect(table.meta.monthlyReports).toEqual(
        perMonth([0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0])
      )
    })

    it('expects nothing of an accreditation that was never granted', async () => {
      const operator = makeOperator({ orgId: 500028 })

      const { table } = await run({
        organisations: [neverAccredited(operator)],
        submissions: []
      })

      expect(table.meta.monthlyReports).toEqual(
        perMonth([0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0])
      )
    })

    it('counts only the months served', async () => {
      const operator = makeOperator({ orgId: 500024 })

      const { table } = await run({
        organisations: [operator.organisation],
        submissions: [],
        reports: [monthlyReport(operator, 2)],
        months: ['2026-01']
      })

      expect(table.meta.monthlyReports).toEqual({
        byMonth: [{ month: '2026-01', expected: 1, submitted: 0 }],
        total: { expected: 1, submitted: 0 }
      })
    })

    it('expects nothing of a registered-only operator, which reports quarterly', async () => {
      const operator = makeOperator({ orgId: 500025 })

      const { table } = await run({
        organisations: [registeredOnly(operator)],
        submissions: []
      })

      expect(table.meta.monthlyReports).toEqual(
        perMonth([0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0])
      )
    })

    it('expects nothing of a test organisation', async () => {
      const operator = makeOperator({ orgId: TEST_ORG_ID })

      const { table } = await run({
        organisations: [operator.organisation],
        submissions: [],
        reports: [monthlyReport(operator, 1)]
      })

      expect(table.meta.monthlyReports).toEqual(
        perMonth([0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0])
      )
    })
  })

  describe('the published grid', () => {
    it('carries a row for every material, accreditation type and month, whatever was reported', async () => {
      const { table } = await run({ organisations: [], submissions: [] })

      const grid = TONNAGE_MONITORING_MATERIALS.flatMap((material) =>
        Object.values(WASTE_PROCESSING_TYPE).flatMap((accreditationType) =>
          JANUARY_TO_JUNE_2026.map((month) => ({
            material,
            accreditationType,
            month
          }))
        )
      )

      expect(
        table.data.map(({ material, accreditationType, month }) => ({
          material,
          accreditationType,
          month
        }))
      ).toEqual(expect.arrayContaining(grid))
      expect(table.data).toHaveLength(96)
    })

    it('serves zeroes for a combination the ledger holds nothing for', async () => {
      const operator = makeOperator({ orgId: 500014 })

      const { table } = await run({
        organisations: [operator.organisation],
        submissions: [
          { ...operator, rows: [receivedRow('row-1', '2026-02-10', 40)] }
        ]
      })

      expect(
        table.data.filter(
          ({ material, accreditationType }) =>
            material === MATERIAL.WOOD &&
            accreditationType === WASTE_PROCESSING_TYPE.EXPORTER
        )
      ).toEqual(
        JANUARY_TO_JUNE_2026.map((month) => ({
          material: MATERIAL.WOOD,
          accreditationType: WASTE_PROCESSING_TYPE.EXPORTER,
          month,
          ...NO_ACTIVITY
        }))
      )
    })

    it('orders the grid by material, accreditation type and month', async () => {
      const { table } = await run({ organisations: [], submissions: [] })

      expect(table.data.slice(0, 3)).toEqual([
        {
          material: MATERIAL.ALUMINIUM,
          accreditationType: WASTE_PROCESSING_TYPE.EXPORTER,
          month: '2026-01',
          ...NO_ACTIVITY
        },
        {
          material: MATERIAL.ALUMINIUM,
          accreditationType: WASTE_PROCESSING_TYPE.EXPORTER,
          month: '2026-02',
          ...NO_ACTIVITY
        },
        {
          material: MATERIAL.ALUMINIUM,
          accreditationType: WASTE_PROCESSING_TYPE.EXPORTER,
          month: '2026-03',
          ...NO_ACTIVITY
        }
      ])
    })
  })

  it('sums two operators of the same material, type and month into one cell', async () => {
    const first = makeOperator({ orgId: 500001 })
    const second = makeOperator({ orgId: 500002 })

    const { table } = await run({
      organisations: [first.organisation, second.organisation],
      submissions: [
        { ...first, rows: [receivedRow('row-1', '2026-02-10', 40)] },
        { ...second, rows: [receivedRow('row-1', '2026-02-20', 60)] }
      ]
    })

    expect(reported(table)).toEqual([
      {
        material: MATERIAL.PLASTIC,
        accreditationType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        month: '2026-02',
        totalCredited: 100,
        eligibleForWasteBalance: 100,
        sentOnDeductions: 0,
        netCredit: 100
      }
    ])
  })

  it('derives eligibility against the accreditation as it stands, not the stamp the row carries', async () => {
    const operator = makeOperator({
      orgId: 500003,
      validFrom: '2026-05-01',
      validTo: '2026-12-31'
    })

    const { table } = await run({
      organisations: [operator.organisation],
      submissions: [
        {
          ...operator,
          rows: [
            receivedRow('row-1', '2026-02-10', 40),
            receivedRow('row-2', '2026-06-10', 60)
          ]
        }
      ]
    })

    expect(reported(table)).toEqual([
      {
        material: MATERIAL.PLASTIC,
        accreditationType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        month: '2026-02',
        totalCredited: 40,
        eligibleForWasteBalance: 0,
        sentOnDeductions: 0,
        netCredit: 0
      },
      {
        material: MATERIAL.PLASTIC,
        accreditationType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        month: '2026-06',
        totalCredited: 60,
        eligibleForWasteBalance: 60,
        sentOnDeductions: 0,
        netCredit: 60
      }
    ])
  })

  it('subtracts the sent-on deductions of the month they left site', async () => {
    const operator = makeOperator({ orgId: 500004 })

    const { table } = await run({
      organisations: [operator.organisation],
      submissions: [
        {
          ...operator,
          rows: [
            receivedRow('row-1', '2026-03-10', 100),
            sentOnRow('row-2', '2026-03-25', 30)
          ]
        }
      ]
    })

    expect(reported(table)).toEqual([
      {
        material: MATERIAL.PLASTIC,
        accreditationType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        month: '2026-03',
        totalCredited: 100,
        eligibleForWasteBalance: 100,
        sentOnDeductions: 30,
        netCredit: 70
      }
    ])
  })

  it('will not type a published row against an unsplit glass material', () => {
    /** @type {import('./waste-balance-table.js').WasteBalanceTableRow} */
    const row = {
      // @ts-expect-error plain glass is not a material a published row can carry
      material: MATERIAL.GLASS,
      accreditationType: WASTE_PROCESSING_TYPE.REPROCESSOR,
      month: '2026-03',
      totalCredited: 0,
      eligibleForWasteBalance: 0,
      sentOnDeductions: 0,
      netCredit: 0
    }

    expect(row.material).toBe(MATERIAL.GLASS)
  })

  it('publishes a glass registration the split reached under its process', async () => {
    const operator = makeOperator({
      orgId: 500013,
      material: MATERIAL.GLASS,
      glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT]
    })

    const { table } = await run({
      organisations: [operator.organisation],
      submissions: [
        { ...operator, rows: [receivedRow('row-1', '2026-03-10', 100)] }
      ]
    })

    expect(reported(table).map(({ material }) => material)).toEqual([
      GLASS_RECYCLING_PROCESS.GLASS_RE_MELT
    ])
  })

  it('ignores a table that does not count under the accreditation', async () => {
    const operator = makeOperator({ orgId: 500012 })

    const { table } = await run({
      organisations: [operator.organisation],
      submissions: [
        {
          ...operator,
          rows: [
            receivedRow('row-1', '2026-03-10', 100),
            processedRow('row-2', '2026-03-12', 90)
          ]
        }
      ]
    })

    expect(reported(table)).toEqual([
      {
        material: MATERIAL.PLASTIC,
        accreditationType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        month: '2026-03',
        totalCredited: 100,
        eligibleForWasteBalance: 100,
        sentOnDeductions: 0,
        netCredit: 100
      }
    ])
  })

  describe('a row with no usable date', () => {
    const operator = makeOperator({ orgId: 500011 })

    const withUndatedDeduction = () =>
      run({
        organisations: [operator.organisation],
        submissions: [
          {
            ...operator,
            rows: [
              receivedRow('row-1', '2026-03-10', 100),
              sentOnRow('row-2', '', 30),
              sentOnRow('row-3', 'not-a-date', 12.5)
            ]
          }
        ]
      })

    it('leaves it out of the deductions', async () => {
      const { table } = await withUndatedDeduction()

      expect(reported(table)).toEqual([
        {
          material: MATERIAL.PLASTIC,
          accreditationType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          month: '2026-03',
          totalCredited: 100,
          eligibleForWasteBalance: 100,
          sentOnDeductions: 0,
          netCredit: 100
        }
      ])
    })

    it('says how many were dropped and how much tonnage they carried', async () => {
      const { logger } = await withUndatedDeduction()

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('2 sent-on row(s) totalling 42.5'),
          event: expect.objectContaining({
            action: 'market_insights_undated_rows'
          })
        })
      )
    })

    it('says the count is not scoped to the months being served', async () => {
      const { logger } = await withUndatedDeduction()

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining(
            'spans every submission read rather than the months served alone'
          )
        })
      )
    })

    it('counts a dropped crediting row against the gross tonnage', async () => {
      const { table, logger } = await run({
        organisations: [operator.organisation],
        submissions: [{ ...operator, rows: [receivedRow('row-1', '', 100)] }]
      })

      expect(reported(table)).toEqual([])
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('1 crediting row(s) totalling 100')
        })
      )
    })

    it('says nothing when every deduction has a date', async () => {
      const { logger } = await run({
        organisations: [operator.organisation],
        submissions: [
          { ...operator, rows: [sentOnRow('row-2', '2026-03-25', 30)] }
        ]
      })

      expect(logger.warn).not.toHaveBeenCalled()
    })
  })

  describe('a month after the window', () => {
    const operator = makeOperator({ orgId: 500012 })

    it('holds the row back rather than publishing it as supply', async () => {
      const { table } = await run({
        organisations: [operator.organisation],
        submissions: [
          {
            ...operator,
            rows: [
              receivedRow('row-1', '2026-06-10', 40),
              receivedRow('row-2', '2026-07-10', 999)
            ]
          }
        ]
      })

      expect(reported(table)).toEqual([
        {
          material: MATERIAL.PLASTIC,
          accreditationType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          month: '2026-06',
          totalCredited: 40,
          eligibleForWasteBalance: 40,
          sentOnDeductions: 0,
          netCredit: 40
        }
      ])
    })
  })

  it('separates materials and accreditation types into their own cells, ordered', async () => {
    const plasticReprocessor = makeOperator({ orgId: 500005 })
    const plasticExporter = makeOperator({
      orgId: 500006,
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
      reprocessingType: undefined,
      overseasSites: { '099': { overseasSiteId: 'site-1' } }
    })
    const paperReprocessor = makeOperator({
      orgId: 500007,
      material: MATERIAL.PAPER
    })

    const { table } = await run({
      organisations: [
        plasticReprocessor.organisation,
        plasticExporter.organisation,
        paperReprocessor.organisation
      ],
      overseasSites: [approvedOverseasSite],
      submissions: [
        {
          ...paperReprocessor,
          rows: [receivedRow('row-1', '2026-02-10', 10)]
        },
        {
          ...plasticReprocessor,
          rows: [receivedRow('row-1', '2026-02-10', 20)]
        },
        {
          ...plasticExporter,
          rows: [exportedRow('row-1', '2026-02-10', 30)]
        }
      ]
    })

    expect(
      reported(table).map(({ material, accreditationType, totalCredited }) => ({
        material,
        accreditationType,
        totalCredited
      }))
    ).toEqual([
      {
        material: MATERIAL.PAPER,
        accreditationType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        totalCredited: 10
      },
      {
        material: MATERIAL.PLASTIC,
        accreditationType: WASTE_PROCESSING_TYPE.EXPORTER,
        totalCredited: 30
      },
      {
        material: MATERIAL.PLASTIC,
        accreditationType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        totalCredited: 20
      }
    ])
  })

  it('leaves out a month before the window', async () => {
    const operator = makeOperator({
      orgId: 500008,
      validFrom: '2025-01-01',
      validTo: '2026-12-31'
    })

    const { table } = await run({
      organisations: [operator.organisation],
      submissions: [
        {
          ...operator,
          rows: [
            receivedRow('row-1', '2025-11-10', 40),
            receivedRow('row-2', '2026-01-10', 60)
          ]
        }
      ]
    })

    expect(reported(table).map((row) => row.month)).toEqual(['2026-01'])
  })

  it('leaves out a test organisation without remarking on it', async () => {
    const operator = makeOperator({ orgId: TEST_ORG_ID })

    const { table, logger } = await run({
      organisations: [operator.organisation],
      submissions: [
        { ...operator, rows: [receivedRow('row-1', '2026-02-10', 40)] }
      ]
    })

    expect(reported(table)).toEqual([])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('names the partition it left out when the accreditation no longer resolves', async () => {
    const operator = makeOperator({ orgId: 500009 })

    const { table, logger } = await run({
      organisations: [],
      submissions: [
        { ...operator, rows: [receivedRow('row-1', '2026-02-10', 40)] }
      ]
    })

    expect(reported(table)).toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('acc-500009'),
        event: expect.objectContaining({
          action: 'market_insights_partition_unmatched',
          reference: 'acc-500009'
        })
      })
    )
  })

  it('leaves out a registered-only partition sharing a summary log with an accredited one', async () => {
    const operator = makeOperator({ orgId: 500010 })
    const registeredOnly = {
      ledgerId: { ...operator.ledgerId, accreditationId: null },
      summaryLogId: operator.summaryLogId
    }

    const { table } = await run({
      organisations: [operator.organisation],
      submissions: [
        { ...operator, rows: [receivedRow('row-1', '2026-02-10', 40)] },
        { ...registeredOnly, rows: [receivedRow('row-1', '2026-02-10', 999)] }
      ]
    })

    expect(reported(table)).toEqual([
      {
        material: MATERIAL.PLASTIC,
        accreditationType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        month: '2026-02',
        totalCredited: 40,
        eligibleForWasteBalance: 40,
        sentOnDeductions: 0,
        netCredit: 40
      }
    ])
  })
})

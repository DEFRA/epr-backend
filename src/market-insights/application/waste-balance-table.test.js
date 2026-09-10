import { describe, it, expect, vi } from 'vitest'
import {
  ACCREDITATION_STATUS,
  MATERIAL,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryOverseasSitesRepository } from '#overseas-sites/repository/inmemory.plugin.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { partialMock } from '#test/type-helpers.js'
import { buildWasteBalanceTable } from './waste-balance-table.js'

// .vite/setup-files.js configures 999999 as a test organisation.
const TEST_ORG_ID = 999999

const NOW = new Date('2026-07-15T12:00:00.000Z')

const ACCREDITED_FROM = '2026-01-01'
const ACCREDITED_TO = '2026-12-31'

const approvedHistory = [
  { status: ACCREDITATION_STATUS.CREATED, updatedAt: '2025-11-01' },
  { status: ACCREDITATION_STATUS.APPROVED, updatedAt: '2025-12-01' }
]

/**
 * An accredited operator with one registration, plus the ledger entry naming
 * the summary log it last submitted.
 *
 * @param {{
 *   orgId: number,
 *   material?: string,
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
  wasteProcessingType = WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType = REPROCESSING_TYPE.INPUT,
  overseasSites,
  validFrom = ACCREDITED_FROM,
  validTo = ACCREDITED_TO
}) => {
  const id = `org-uuid-${orgId}`
  const registrationId = `reg-${orgId}`
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
 * Run the aggregation over in-memory adapters seeded with the given
 * submissions. Each submission names the ledger partition that wrote it, so a
 * test can put two partitions behind one summary log.
 *
 * @param {{
 *   organisations: any[],
 *   submissions: any[],
 *   overseasSites?: import('#overseas-sites/repository/port.js').OverseasSite[],
 *   reportingYear?: number,
 *   now?: Date
 * }} options
 */
const run = async ({
  organisations,
  submissions,
  overseasSites = [],
  reportingYear = 2026,
  now = NOW
}) => {
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
    logger: partialMock(logger),
    reportingYear,
    now
  })

  return { table, logger }
}

describe('buildWasteBalanceTable', () => {
  it('reports the reporting year and the clock it was given', async () => {
    const { table } = await run({ organisations: [], submissions: [] })

    expect(table).toEqual({
      meta: { generatedAt: NOW.toISOString(), reportingYear: 2026 },
      data: []
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

    expect(table.data).toEqual([
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

    expect(table.data).toEqual([
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

    expect(table.data).toEqual([
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

  it('reads each partition at its own latest submission', async () => {
    const resubmitted = makeOperator({ orgId: 500014 })
    const unchanged = makeOperator({ orgId: 500015 })

    const { table } = await run({
      organisations: [resubmitted.organisation, unchanged.organisation],
      submissions: [
        {
          ...resubmitted,
          summaryLogId: 'log-first',
          rows: [receivedRow('row-1', '2026-02-10', 999)]
        },
        {
          ...resubmitted,
          summaryLogId: 'log-second',
          rows: [receivedRow('row-1', '2026-02-10', 40)]
        },
        {
          ...unchanged,
          summaryLogId: 'log-first',
          rows: [receivedRow('row-1', '2026-02-10', 60)]
        }
      ]
    })

    expect(table.data).toEqual([
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

  it('counts a glass registration the split never reached against no material', async () => {
    const operator = makeOperator({ orgId: 500013, material: MATERIAL.GLASS })

    const { table } = await run({
      organisations: [operator.organisation],
      submissions: [
        { ...operator, rows: [receivedRow('row-1', '2026-03-10', 100)] }
      ]
    })

    expect(table.data.map(({ material }) => material)).toEqual([''])
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

    expect(table.data).toEqual([
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

      expect(table.data).toEqual([
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

    it('counts a dropped crediting row against the gross tonnage', async () => {
      const { table, logger } = await run({
        organisations: [operator.organisation],
        submissions: [{ ...operator, rows: [receivedRow('row-1', '', 100)] }]
      })

      expect(table.data).toEqual([])
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

  describe('a month later than the clock', () => {
    const operator = makeOperator({ orgId: 500012 })

    it('holds the row back rather than publishing it as supply', async () => {
      const { table } = await run({
        organisations: [operator.organisation],
        submissions: [
          {
            ...operator,
            rows: [
              receivedRow('row-1', '2026-06-10', 40),
              receivedRow('row-2', '2026-12-10', 999)
            ]
          }
        ]
      })

      expect(table.data).toEqual([
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
      table.data.map(({ material, accreditationType, totalCredited }) => ({
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

  it('leaves out the months of other reporting years', async () => {
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

    expect(table.data.map((row) => row.month)).toEqual(['2026-01'])
  })

  it('leaves out a test organisation', async () => {
    const operator = makeOperator({ orgId: TEST_ORG_ID })

    const { table } = await run({
      organisations: [operator.organisation],
      submissions: [
        { ...operator, rows: [receivedRow('row-1', '2026-02-10', 40)] }
      ]
    })

    expect(table.data).toEqual([])
  })

  it('leaves out a partition whose accreditation no longer resolves', async () => {
    const operator = makeOperator({ orgId: 500009 })

    const { table } = await run({
      organisations: [],
      submissions: [
        { ...operator, rows: [receivedRow('row-1', '2026-02-10', 40)] }
      ]
    })

    expect(table.data).toEqual([])
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

    expect(table.data).toEqual([
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

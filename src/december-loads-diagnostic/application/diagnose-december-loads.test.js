import { buildDecemberLoadsReport } from './diagnose-december-loads.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import {
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

/**
 * @import {TypedLogger} from '#common/hapi-types.js'
 * @import {OrganisationsRepository} from '#repositories/organisations/port.js'
 * @import {WasteBalanceLedgerRepository} from '#waste-balances/repository/ledger-port.js'
 * @import {SummaryLogRowStatesRepository} from '#waste-records/repository/port.js'
 */

// .vite/setup-files.js sets TEST_ORGANISATIONS='[999999]'.
const TEST_ORG_ID = 999999

const VALID_FROM = '2026-01-01'
const VALID_TO = '2026-12-31'

/**
 * @param {{
 *   orgId: number,
 *   wasteProcessingType?: string,
 *   reprocessingType?: string,
 *   validFrom?: string
 * }} options
 */
const makeAccreditation = ({
  orgId,
  wasteProcessingType = WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType = REPROCESSING_TYPE.INPUT,
  validFrom = VALID_FROM
}) => {
  const id = `org-uuid-${orgId}`
  const registrationId = `reg-${orgId}`
  const accreditationId = `acc-${orgId}`
  return {
    accreditationId,
    organisation: {
      id,
      orgId,
      registrations: [
        {
          id: registrationId,
          accreditationId,
          wasteProcessingType,
          reprocessingType
        }
      ],
      accreditations: [
        {
          id: accreditationId,
          accreditationNumber: `ACC-${orgId}`,
          status: 'approved',
          validFrom,
          validTo: VALID_TO,
          wasteProcessingType,
          reprocessingType
        }
      ]
    },
    entry: {
      ledgerId: { organisationId: id, registrationId, accreditationId },
      summaryLogId: `log-${orgId}`
    }
  }
}

/** @param {number} amount */
const included = (amount) => ({
  outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
  transactionAmount: amount
})

const receivedRow = (date, amount = 10) => ({
  rowId: `received-${date}`,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  data: { DATE_RECEIVED_FOR_REPROCESSING: date },
  classification: included(amount)
})

const sentOnRow = (date, amount = 10) => ({
  rowId: `sent-on-${date}`,
  wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  data: { DATE_LOAD_LEFT_SITE: date },
  classification: included(amount)
})

const exportedRow = (date, amount = 10) => ({
  rowId: `exported-${date}`,
  wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
  processingType: PROCESSING_TYPES.EXPORTER,
  data: {
    DATE_RECEIVED_BY_OSR: date,
    DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No'
  },
  classification: included(amount)
})

const processedRow = (date, amount = 10) => ({
  rowId: `processed-${date}`,
  wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
  processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT,
  data: { DATE_LOAD_LEFT_SITE: date },
  classification: included(amount)
})

/** @param {number} [decemberAmount] */
const ledgerEvent = (decemberAmount) => ({
  closingBalance: {
    amount: 100,
    availableAmount: 100,
    ...(decemberAmount !== undefined && { decemberAmount })
  }
})

/**
 * @param {{
 *   organisations: any[],
 *   entries: any[],
 *   rowStatesByAccreditationId?: Record<string, any[]>,
 *   ledgerByAccreditationId?: Record<string, any>
 * }} options
 */
const run = async ({
  organisations,
  entries,
  rowStatesByAccreditationId = {},
  ledgerByAccreditationId = {}
}) => {
  const logger = { info: vi.fn(), warn: vi.fn() }
  const findLatestInLedger = vi.fn(
    async (/** @type {{ accreditationId: string }} */ ledgerId) =>
      ledgerByAccreditationId[ledgerId.accreditationId] ?? null
  )
  const ledgerRepository = {
    findLatestSubmittedSummaryLogPerLedger: async () => entries,
    findLatestInLedger
  }
  const summaryLogRowStatesRepository = {
    findRowStatesForSummaryLog: async (
      /** @type {{ accreditationId: string }} */ ledgerId
    ) => rowStatesByAccreditationId[ledgerId.accreditationId] ?? []
  }
  const organisationsRepository = { findAll: async () => organisations }

  return {
    logger,
    findLatestInLedger,
    report: await buildDecemberLoadsReport({
      ledgerRepository: /** @type {WasteBalanceLedgerRepository} */ (
        /** @type {unknown} */ (ledgerRepository)
      ),
      summaryLogRowStatesRepository:
        /** @type {SummaryLogRowStatesRepository} */ (
          /** @type {unknown} */ (summaryLogRowStatesRepository)
        ),
      organisationsRepository: /** @type {OrganisationsRepository} */ (
        /** @type {unknown} */ (organisationsRepository)
      ),
      logger: /** @type {TypedLogger} */ (/** @type {unknown} */ (logger))
    })
  }
}

describe('buildDecemberLoadsReport', () => {
  it('flags an exporter whose ledger December disagrees with its December exported loads', async () => {
    const { organisation, accreditationId, entry } = makeAccreditation({
      orgId: 500001,
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER
    })

    const { report } = await run({
      organisations: [organisation],
      entries: [entry],
      rowStatesByAccreditationId: {
        [accreditationId]: [
          exportedRow('2026-12-05', 30),
          exportedRow('2026-06-01', 99)
        ]
      },
      ledgerByAccreditationId: { [accreditationId]: ledgerEvent(12) }
    })

    expect(report.reports).toEqual([
      {
        organisationId: 'org-uuid-500001',
        organisationReference: '500001',
        accreditationId,
        accreditationNumber: 'ACC-500001',
        processingType: 'EXPORTER',
        decemberKey: '2026-12',
        summaryLogDecemberTonnage: 30,
        ledgerDecemberBalance: 12
      }
    ])
    expect(report.summary).toEqual({
      scannedAccreditations: 1,
      accreditationsWithDecember: 1,
      mismatchedAccreditations: 1
    })
  })

  it('flags a reprocessor-input accreditation whose ledger records no December portion', async () => {
    const { organisation, accreditationId, entry } = makeAccreditation({
      orgId: 500002
    })

    const { report } = await run({
      organisations: [organisation],
      entries: [entry],
      rowStatesByAccreditationId: {
        [accreditationId]: [receivedRow('2026-12-01', 20)]
      },
      ledgerByAccreditationId: { [accreditationId]: ledgerEvent(undefined) }
    })

    expect(report.reports[0]).toMatchObject({
      accreditationId,
      summaryLogDecemberTonnage: 20,
      ledgerDecemberBalance: null
    })
    expect(report.summary).toEqual({
      scannedAccreditations: 1,
      accreditationsWithDecember: 1,
      mismatchedAccreditations: 1
    })
  })

  it('flags an accreditation whose ledger holds no events at all', async () => {
    const { organisation, accreditationId, entry } = makeAccreditation({
      orgId: 500011
    })

    const { report } = await run({
      organisations: [organisation],
      entries: [entry],
      rowStatesByAccreditationId: {
        [accreditationId]: [receivedRow('2026-12-01', 20)]
      }
    })

    expect(report.reports[0]).toMatchObject({
      accreditationId,
      summaryLogDecemberTonnage: 20,
      ledgerDecemberBalance: null
    })
    expect(report.summary.mismatchedAccreditations).toBe(1)
  })

  it('does not flag an accreditation whose ledger December equals expected', async () => {
    const { organisation, accreditationId, entry } = makeAccreditation({
      orgId: 500003
    })

    const { report } = await run({
      organisations: [organisation],
      entries: [entry],
      rowStatesByAccreditationId: {
        [accreditationId]: [receivedRow('2026-12-01', 20)]
      },
      ledgerByAccreditationId: { [accreditationId]: ledgerEvent(20) }
    })

    expect(report.reports).toEqual([])
    expect(report.summary).toEqual({
      scannedAccreditations: 1,
      accreditationsWithDecember: 1,
      mismatchedAccreditations: 0
    })
  })

  it('skips an accreditation with no December tonnage without reading the ledger', async () => {
    const { organisation, accreditationId, entry } = makeAccreditation({
      orgId: 500004
    })

    const { report, findLatestInLedger } = await run({
      organisations: [organisation],
      entries: [entry],
      rowStatesByAccreditationId: {
        [accreditationId]: [receivedRow('2026-06-01', 20)]
      }
    })

    expect(report.reports).toEqual([])
    expect(report.summary).toEqual({
      scannedAccreditations: 1,
      accreditationsWithDecember: 0,
      mismatchedAccreditations: 0
    })
    expect(findLatestInLedger).not.toHaveBeenCalled()
  })

  it('excludes December sent-on loads from the expected December portion', async () => {
    const { organisation, accreditationId, entry } = makeAccreditation({
      orgId: 500005
    })

    const { report, findLatestInLedger } = await run({
      organisations: [organisation],
      entries: [entry],
      rowStatesByAccreditationId: {
        [accreditationId]: [sentOnRow('2026-12-20', 40)]
      }
    })

    expect(report.reports).toEqual([])
    expect(report.summary.accreditationsWithDecember).toBe(0)
    expect(findLatestInLedger).not.toHaveBeenCalled()
  })

  it('never flags a reprocessor-output accreditation, even with December processed loads', async () => {
    const { organisation, accreditationId, entry } = makeAccreditation({
      orgId: 500006,
      reprocessingType: REPROCESSING_TYPE.OUTPUT
    })

    const { report } = await run({
      organisations: [organisation],
      entries: [entry],
      rowStatesByAccreditationId: {
        [accreditationId]: [processedRow('2026-12-05', 50)]
      },
      ledgerByAccreditationId: { [accreditationId]: ledgerEvent(undefined) }
    })

    expect(report.reports).toEqual([])
    expect(report.summary).toEqual({
      scannedAccreditations: 1,
      accreditationsWithDecember: 0,
      mismatchedAccreditations: 0
    })
  })

  it('skips registered-only entries with no accreditation', async () => {
    const { organisation } = makeAccreditation({ orgId: 500007 })

    const { report } = await run({
      organisations: [organisation],
      entries: [
        {
          ledgerId: {
            organisationId: 'org-uuid-500007',
            registrationId: 'reg-500007',
            accreditationId: null
          },
          summaryLogId: 'log-ro-500007'
        }
      ]
    })

    expect(report.reports).toEqual([])
    expect(report.summary.scannedAccreditations).toBe(0)
  })

  it('warns and skips an accredited entry with no matching accreditation', async () => {
    const { logger, report } = await run({
      organisations: [],
      entries: [
        {
          ledgerId: {
            organisationId: 'org-uuid-orphan',
            registrationId: 'reg-orphan',
            accreditationId: 'acc-orphan'
          },
          summaryLogId: 'log-orphan'
        }
      ]
    })

    expect(report.reports).toEqual([])
    expect(report.summary.scannedAccreditations).toBe(0)
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('silently drops entries belonging to a test organisation', async () => {
    const { organisation, accreditationId, entry } = makeAccreditation({
      orgId: TEST_ORG_ID
    })

    const { logger, report } = await run({
      organisations: [organisation],
      entries: [entry],
      rowStatesByAccreditationId: {
        [accreditationId]: [receivedRow('2026-12-01', 20)]
      },
      ledgerByAccreditationId: { [accreditationId]: ledgerEvent(undefined) }
    })

    expect(report.reports).toEqual([])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('indexes an organisation that also carries a registered-only registration', async () => {
    const { organisation, accreditationId, entry } = makeAccreditation({
      orgId: 500008
    })
    organisation.registrations.push(
      /** @type {any} */ ({
        id: 'reg-ro-500008',
        accreditationId: null,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        reprocessingType: REPROCESSING_TYPE.INPUT
      })
    )

    const { report } = await run({
      organisations: [organisation],
      entries: [entry],
      rowStatesByAccreditationId: {
        [accreditationId]: [receivedRow('2026-12-01', 20)]
      },
      ledgerByAccreditationId: { [accreditationId]: ledgerEvent(undefined) }
    })

    expect(report.reports).toHaveLength(1)
    expect(report.summary.scannedAccreditations).toBe(1)
  })

  it('tie-breaks by accreditation id and renders an empty accreditation number', async () => {
    const registrationA = {
      id: 'reg-a-500009',
      accreditationId: 'acc-a-500009',
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
      reprocessingType: REPROCESSING_TYPE.INPUT
    }
    const registrationB = {
      id: 'reg-b-500009',
      accreditationId: 'acc-b-500009',
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
      reprocessingType: REPROCESSING_TYPE.INPUT
    }
    const organisation = {
      id: 'org-uuid-500009',
      orgId: 500009,
      registrations: [registrationA, registrationB],
      accreditations: [
        {
          id: 'acc-b-500009',
          status: 'approved',
          validFrom: VALID_FROM,
          validTo: VALID_TO,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          reprocessingType: REPROCESSING_TYPE.INPUT
        },
        {
          id: 'acc-a-500009',
          accreditationNumber: 'ACC-A',
          status: 'approved',
          validFrom: VALID_FROM,
          validTo: VALID_TO,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          reprocessingType: REPROCESSING_TYPE.INPUT
        }
      ]
    }

    const { report } = await run({
      organisations: [organisation],
      entries: [
        {
          ledgerId: {
            organisationId: 'org-uuid-500009',
            registrationId: 'reg-a-500009',
            accreditationId: 'acc-a-500009'
          },
          summaryLogId: 'log-a-500009'
        },
        {
          ledgerId: {
            organisationId: 'org-uuid-500009',
            registrationId: 'reg-b-500009',
            accreditationId: 'acc-b-500009'
          },
          summaryLogId: 'log-b-500009'
        }
      ],
      rowStatesByAccreditationId: {
        'acc-a-500009': [receivedRow('2026-12-01', 20)],
        'acc-b-500009': [receivedRow('2026-12-02', 20)]
      },
      ledgerByAccreditationId: {
        'acc-a-500009': ledgerEvent(undefined),
        'acc-b-500009': ledgerEvent(undefined)
      }
    })

    expect(report.reports.map((r) => r.accreditationId)).toEqual([
      'acc-a-500009',
      'acc-b-500009'
    ])
    expect(report.reports[1].accreditationNumber).toBe('')
  })

  it('aggregates and sorts mismatches across accreditations by organisation reference', async () => {
    const a = makeAccreditation({ orgId: 500020 })
    const b = makeAccreditation({ orgId: 500010 })

    const { report } = await run({
      organisations: [a.organisation, b.organisation],
      entries: [a.entry, b.entry],
      rowStatesByAccreditationId: {
        [a.accreditationId]: [receivedRow('2026-12-01', 20)],
        [b.accreditationId]: [
          receivedRow('2026-12-01', 20),
          sentOnRow('2026-12-02', 40)
        ]
      },
      ledgerByAccreditationId: {
        [a.accreditationId]: ledgerEvent(undefined),
        [b.accreditationId]: ledgerEvent(undefined)
      }
    })

    expect(report.reports.map((r) => r.organisationReference)).toEqual([
      '500010',
      '500020'
    ])
    expect(report.summary).toEqual({
      scannedAccreditations: 2,
      accreditationsWithDecember: 2,
      mismatchedAccreditations: 2
    })
  })
})

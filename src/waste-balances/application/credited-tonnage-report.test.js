import { buildCreditedTonnageReport } from './credited-tonnage-report.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL,
  REPROCESSING_TYPE,
  WASTE_PROCESSING_TYPE
} from '#domain/organisations/model.js'

/**
 * @import {TypedLogger} from '#common/hapi-types.js'
 * @import {OrganisationReadRepository} from '#organisation-read-model/repository/port.js'
 * @import {WasteBalanceLedgerRepository} from '#waste-balances/repository/ledger-port.js'
 * @import {SummaryLogRowStatesRepository} from '#waste-records/repository/port.js'
 */

// The test environment configures 999999 as a test organisation
// (.vite/setup-files.js sets TEST_ORGANISATIONS='[999999]').
const TEST_ORG_ID = 999999

// A fixed clock: January 2026 → March 2026 is the report window.
const NOW = new Date('2026-03-15T12:00:00.000Z')

// The window every fixture accreditation is valid across, unless a test names
// its own (from its approval to 31 December of its year) — wide enough to
// cover the whole report range.
const ACCREDITED_FROM = '2026-01-01'
const ACCREDITED_YEAR = '2026'

/**
 * A read-model organisation holding one registration with one accreditation,
 * plus the ledger entry (ids and numbers) that names it. The accreditation's
 * window starts at `validFrom` (its approval entry) and ends on 31 December of
 * the year it is keyed by.
 *
 * @param {{
 *   orgId: number,
 *   material?: string,
 *   wasteProcessingType?: string,
 *   reprocessingType?: string,
 *   status?: string,
 *   validFrom?: string,
 *   year?: string,
 *   overseasSites?: { registered: Record<string, any>, accredited: Record<string, any> }
 * }} options
 */
const makeAccreditation = ({
  orgId,
  material = MATERIAL.PLASTIC,
  wasteProcessingType = WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType = REPROCESSING_TYPE.INPUT,
  status = 'approved',
  validFrom = ACCREDITED_FROM,
  year = ACCREDITED_YEAR,
  overseasSites
}) => {
  const organisationNumber = String(orgId)
  const registrationNumber = `REG-${orgId}`
  const accreditationNumber = `ACC-${orgId}`
  const accreditationId = `acc-${orgId}`
  const isExporter = wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER
  const registration = {
    material,
    wasteProcessingType,
    ...(isExporter
      ? { overseasSites: overseasSites?.registered ?? {} }
      : { reprocessingType }),
    accreditations: {
      [year]: {
        accreditationNumber,
        status: {
          current: status,
          timeline: [
            { status: 'created', at: '2025-11-01T00:00:00.000Z' },
            {
              status: 'approved',
              at: new Date(validFrom).toISOString()
            }
          ]
        },
        ...(isExporter && {
          overseasSites: overseasSites?.accredited ?? {}
        })
      }
    }
  }
  const organisation = {
    organisationNumber,
    registrations: { [registrationNumber]: registration }
  }
  return {
    organisation,
    accreditationId,
    ledgerEntry: ledgerEntryFor({
      orgId,
      registrationNumber,
      accreditationNumber,
      accreditationId
    })
  }
}

const ledgerEntryFor = ({
  orgId,
  registrationNumber,
  accreditationNumber,
  accreditationId
}) => ({
  ledgerId: {
    organisationId: `org-uuid-${orgId}`,
    registrationId: `reg-${orgId}`,
    accreditationId,
    organisationNumber: String(orgId),
    registrationNumber,
    accreditationNumber
  },
  summaryLogId: `log-${orgId}`
})

// The classification each fixture row carries from its submission. Every test
// stamps the opposite of the answer the live context gives, so a report that
// read the stamp instead of re-deriving cannot produce the expected figures.
const stampedIncluded = (transactionAmount) => ({
  outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
  reasons: [],
  transactionAmount
})

const STAMPED_EXCLUDED = {
  outcome: WASTE_BALANCE_OUTCOME.EXCLUDED,
  reasons: [],
  transactionAmount: 0
}

/**
 * A received row holding every field the waste-balance classifier reads, so it
 * classifies from its own content.
 *
 * @param {string} date
 * @param {number} tonnage
 * @param {import('#waste-records/repository/schema.js').RowClassification} [stamped]
 */
const receivedRow = (date, tonnage, stamped = STAMPED_EXCLUDED) => ({
  rowId: `row-${date}-${tonnage}`,
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
  classification: stamped
})

/**
 * An exported row, likewise complete. The report buckets it by the date the
 * overseas reprocessor received it.
 *
 * @param {string} dateReceivedByOsr
 * @param {number} tonnage
 * @param {import('#waste-records/repository/schema.js').RowClassification} [stamped]
 */
const exportedRow = (
  dateReceivedByOsr,
  tonnage,
  stamped = STAMPED_EXCLUDED
) => ({
  ...receivedRow(dateReceivedByOsr, tonnage, stamped),
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

/**
 * An exporter's overseas site 099: registered with its name and country, and
 * accredited as approved on `approvedOn`, or still pending when omitted.
 *
 * @param {{ approvedOn?: string }} [options]
 */
const overseasSite = ({ approvedOn } = {}) => ({
  registered: {
    '099': {
      name: 'Site 099',
      address: { country: 'Netherlands', townOrCity: 'Rotterdam' }
    }
  },
  accredited: {
    '099': approvedOn
      ? { status: 'approved', approvedOn }
      : { status: 'pending' }
  }
})

/**
 * @param {{
 *   organisations: any[],
 *   entries: any[],
 *   rowStatesByAccreditationId?: Record<string, any[]>,
 *   now?: Date
 * }} options
 */
const run = ({
  organisations,
  entries,
  rowStatesByAccreditationId = {},
  now = NOW
}) => {
  const logger = { info: vi.fn(), warn: vi.fn() }
  const ledgerRepository = {
    findLatestSubmittedSummaryLogPerLedger: async () => entries
  }
  const summaryLogRowStatesRepository = {
    findWasteRecordStatesForSummaryLog: async (
      /** @type {{ accreditationId: string }} */ ledgerId
    ) => rowStatesByAccreditationId[ledgerId.accreditationId] ?? []
  }
  const organisationReadRepository = { findAll: async () => organisations }

  return {
    logger,
    report: buildCreditedTonnageReport({
      ledgerRepository: /** @type {WasteBalanceLedgerRepository} */ (
        /** @type {unknown} */ (ledgerRepository)
      ),
      summaryLogRowStatesRepository:
        /** @type {SummaryLogRowStatesRepository} */ (
          /** @type {unknown} */ (summaryLogRowStatesRepository)
        ),
      organisationReadRepository: /** @type {OrganisationReadRepository} */ (
        /** @type {unknown} */ (organisationReadRepository)
      ),
      logger: /** @type {TypedLogger} */ (/** @type {unknown} */ (logger)),
      now
    })
  }
}

describe('buildCreditedTonnageReport', () => {
  it('produces the documented response shape, one zero-filled row per month from January 2026 to the current month', async () => {
    const { organisation, accreditationId, ledgerEntry } = makeAccreditation({
      orgId: 500001
    })

    const { report } = run({
      organisations: [organisation],
      entries: [ledgerEntry],
      rowStatesByAccreditationId: {
        [accreditationId]: [receivedRow('2026-02-10', 100)]
      }
    })

    expect(await report).toEqual({
      meta: { generatedAt: NOW.toISOString() },
      data: [
        {
          month: '2026-01',
          organisation: { id: 'org-uuid-500001', reference: '500001' },
          accreditation: {
            id: 'acc-500001',
            accreditationNumber: 'ACC-500001',
            processingType: 'reprocessor',
            material: 'plastic'
          },
          tonnage: {
            totalCredited: 0,
            eligibleForWasteBalance: 0,
            sentOnDeductions: 0
          }
        },
        {
          month: '2026-02',
          organisation: { id: 'org-uuid-500001', reference: '500001' },
          accreditation: {
            id: 'acc-500001',
            accreditationNumber: 'ACC-500001',
            processingType: 'reprocessor',
            material: 'plastic'
          },
          tonnage: {
            totalCredited: 100,
            eligibleForWasteBalance: 100,
            sentOnDeductions: 0
          }
        },
        {
          month: '2026-03',
          organisation: { id: 'org-uuid-500001', reference: '500001' },
          accreditation: {
            id: 'acc-500001',
            accreditationNumber: 'ACC-500001',
            processingType: 'reprocessor',
            material: 'plastic'
          },
          tonnage: {
            totalCredited: 0,
            eligibleForWasteBalance: 0,
            sentOnDeductions: 0
          }
        }
      ]
    })
  })

  it('reports glass as re-melt and other, as the read model records it', async () => {
    const reMelt = makeAccreditation({
      orgId: 500001,
      material: GLASS_RECYCLING_PROCESS.GLASS_RE_MELT
    })
    const other = makeAccreditation({
      orgId: 500002,
      material: GLASS_RECYCLING_PROCESS.GLASS_OTHER
    })

    const { report } = run({
      organisations: [reMelt.organisation, other.organisation],
      entries: [reMelt.ledgerEntry, other.ledgerEntry],
      rowStatesByAccreditationId: {
        [reMelt.accreditationId]: [receivedRow('2026-01-10', 10)],
        [other.accreditationId]: [receivedRow('2026-01-10', 20)]
      }
    })

    const materials = new Set(
      (await report).data.map((r) => r.accreditation.material)
    )
    expect(materials).toEqual(new Set(['glass_re_melt', 'glass_other']))
  })

  it('excludes test organisations by external reference', async () => {
    const real = makeAccreditation({ orgId: 500001 })
    const testOrg = makeAccreditation({ orgId: TEST_ORG_ID })

    const { report, logger } = run({
      organisations: [real.organisation, testOrg.organisation],
      entries: [real.ledgerEntry, testOrg.ledgerEntry],
      rowStatesByAccreditationId: {
        [real.accreditationId]: [receivedRow('2026-01-10', 10)],
        [testOrg.accreditationId]: [receivedRow('2026-01-10', 999)]
      }
    })

    const references = new Set(
      (await report).data.map((r) => r.organisation.reference)
    )
    expect(references).toEqual(new Set(['500001']))
    // A dropped test-org ledger entry is expected, not an orphan — no warning.
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('ignores a registered-only registration (no accreditation) without warning', async () => {
    const registeredOnly = {
      organisationNumber: '500007',
      registrations: {
        'REG-500007': {
          material: MATERIAL.PLASTIC,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          reprocessingType: REPROCESSING_TYPE.INPUT,
          accreditations: {}
        }
      }
    }

    const { report, logger } = run({
      organisations: [registeredOnly],
      entries: []
    })

    expect((await report).data).toEqual([])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('warns once for a ledger entry whose accreditation numbers match nothing in the read model', async () => {
    const { organisation } = makeAccreditation({ orgId: 500008 })

    const { report, logger } = run({
      organisations: [organisation],
      entries: [
        ledgerEntryFor({
          orgId: 500008,
          registrationNumber: 'REG-500008',
          accreditationNumber: 'ACC-DANGLING',
          accreditationId: 'acc-dangling'
        })
      ]
    })

    expect((await report).data).toEqual([])
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ reference: 'ACC-DANGLING' })
      })
    )
  })

  // Accepted behaviour change: the read model drops an accreditation it cannot
  // serve (so it is absent from findAll); the entry is unmatched and warned.
  it('warns for a ledger entry whose accreditation the read model dropped', async () => {
    const { ledgerEntry } = makeAccreditation({ orgId: 500009 })

    const { report, logger } = run({
      organisations: [],
      entries: [ledgerEntry]
    })

    expect((await report).data).toEqual([])
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('uses the Europe/London calendar month for the upper bound', async () => {
    const { organisation, accreditationId, ledgerEntry } = makeAccreditation({
      orgId: 500001
    })

    // 23:30 UTC on 30 June is 00:30 BST on 1 July — the London month is July.
    const { report } = run({
      organisations: [organisation],
      entries: [ledgerEntry],
      rowStatesByAccreditationId: { [accreditationId]: [] },
      now: new Date('2026-06-30T23:30:00.000Z')
    })

    const months = (await report).data.map((r) => r.month)
    expect(months[months.length - 1]).toBe('2026-07')
  })

  it('omits accreditations that have no submitted summary log (absent from the ledger query)', async () => {
    const submitted = makeAccreditation({ orgId: 500001 })
    const neverSubmitted = makeAccreditation({ orgId: 500002 })

    const { report } = run({
      organisations: [submitted.organisation, neverSubmitted.organisation],
      entries: [submitted.ledgerEntry],
      rowStatesByAccreditationId: {
        [submitted.accreditationId]: [receivedRow('2026-01-10', 10)]
      }
    })

    const ids = new Set((await report).data.map((r) => r.accreditation.id))
    expect(ids).toEqual(new Set(['acc-500001']))
  })

  it('zero-fills an accreditation that submitted but has no in-range rows', async () => {
    const { organisation, accreditationId, ledgerEntry } = makeAccreditation({
      orgId: 500001
    })

    const { report } = run({
      organisations: [organisation],
      entries: [ledgerEntry],
      rowStatesByAccreditationId: { [accreditationId]: [] }
    })

    const rows = (await report).data
    expect(rows.map((r) => r.month)).toEqual(['2026-01', '2026-02', '2026-03'])
    expect(
      rows.every(
        (r) =>
          r.tonnage.totalCredited === 0 &&
          r.tonnage.eligibleForWasteBalance === 0 &&
          r.tonnage.sentOnDeductions === 0
      )
    ).toBe(true)
  })

  it('does not filter by accreditation status — a cancelled accreditation still appears', async () => {
    const { organisation, accreditationId, ledgerEntry } = makeAccreditation({
      orgId: 500001,
      status: 'cancelled'
    })

    const { report } = run({
      organisations: [organisation],
      entries: [ledgerEntry],
      rowStatesByAccreditationId: {
        [accreditationId]: [receivedRow('2026-02-10', 40)]
      }
    })

    expect(
      (await report).data.find((r) => r.month === '2026-02')?.tonnage
    ).toEqual({
      totalCredited: 40,
      eligibleForWasteBalance: 40,
      sentOnDeductions: 0
    })
  })

  it('sorts rows by material, then processing type, then organisation reference, then month', async () => {
    const plasticReprocessor = makeAccreditation({
      orgId: 500002,
      material: MATERIAL.PLASTIC,
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
      reprocessingType: REPROCESSING_TYPE.INPUT
    })
    const aluminiumExporterLowRef = makeAccreditation({
      orgId: 500001,
      material: MATERIAL.ALUMINIUM,
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
      reprocessingType: undefined
    })
    const aluminiumExporterHighRef = makeAccreditation({
      orgId: 500003,
      material: MATERIAL.ALUMINIUM,
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
      reprocessingType: undefined
    })

    const { report } = run({
      organisations: [
        plasticReprocessor.organisation,
        aluminiumExporterLowRef.organisation,
        aluminiumExporterHighRef.organisation
      ],
      entries: [
        plasticReprocessor.ledgerEntry,
        aluminiumExporterLowRef.ledgerEntry,
        aluminiumExporterHighRef.ledgerEntry
      ]
    })

    const order = (await report).data.map((r) => ({
      material: r.accreditation.material,
      type: r.accreditation.processingType,
      reference: r.organisation.reference,
      month: r.month
    }))

    // aluminium (exporter) before plastic; within aluminium, reference 500001
    // before 500003; each block runs January → March.
    expect(order.slice(0, 3)).toEqual([
      {
        material: 'aluminium',
        type: 'exporter',
        reference: '500001',
        month: '2026-01'
      },
      {
        material: 'aluminium',
        type: 'exporter',
        reference: '500001',
        month: '2026-02'
      },
      {
        material: 'aluminium',
        type: 'exporter',
        reference: '500001',
        month: '2026-03'
      }
    ])
    expect(order.slice(3, 6).map((r) => r.reference)).toEqual([
      '500003',
      '500003',
      '500003'
    ])
    expect(order.slice(6).every((r) => r.material === 'plastic')).toBe(true)
  })

  it('keeps each accreditation contiguous when two share an organisation, material and type', async () => {
    const commonFields = {
      material: MATERIAL.PLASTIC,
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
      reprocessingType: REPROCESSING_TYPE.INPUT
    }
    const accreditationFor = (accreditationNumber) => ({
      accreditationNumber,
      status: {
        current: 'approved',
        timeline: [
          { status: 'created', at: '2025-11-01T00:00:00.000Z' },
          { status: 'approved', at: '2026-01-01T00:00:00.000Z' }
        ]
      }
    })
    const twoAccreditationOrg = {
      organisationNumber: '500005',
      registrations: {
        'REG-A': {
          ...commonFields,
          accreditations: { 2026: accreditationFor('ACC-A') }
        },
        'REG-B': {
          ...commonFields,
          accreditations: { 2026: accreditationFor('ACC-B') }
        }
      }
    }
    const entryFor = (suffix, accreditationId) => ({
      ledgerId: {
        organisationId: 'org-uuid-500005',
        registrationId: `reg-${suffix}`,
        accreditationId,
        organisationNumber: '500005',
        registrationNumber: `REG-${suffix.toUpperCase()}`,
        accreditationNumber: `ACC-${suffix.toUpperCase()}`
      },
      summaryLogId: `log-${suffix}`
    })

    const { report } = run({
      organisations: [twoAccreditationOrg],
      entries: [entryFor('a', 'acc-a'), entryFor('b', 'acc-b')],
      rowStatesByAccreditationId: {
        'acc-a': [receivedRow('2026-03-10', 10)],
        'acc-b': [receivedRow('2026-02-10', 20)]
      }
    })

    expect((await report).data.map((r) => r.accreditation.id)).toEqual([
      'acc-a',
      'acc-a',
      'acc-a',
      'acc-b',
      'acc-b',
      'acc-b'
    ])
  })

  it('logs one structured line per accreditation, splitting the skipped rows by why they could not be placed', async () => {
    const { organisation, accreditationId, ledgerEntry } = makeAccreditation({
      orgId: 500001
    })

    const { report, logger } = run({
      organisations: [organisation],
      entries: [ledgerEntry],
      rowStatesByAccreditationId: {
        [accreditationId]: [
          receivedRow('2026-02-10', 10),
          receivedRow('not-a-date', 99),
          receivedRow('2025-01-01', 88),
          receivedRow('2036-01-01', 7)
        ]
      }
    })

    await report

    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'Credited tonnage report skipped 3 row(s) for accreditation acc-500001: ' +
          '1 with no usable date (99t credited, 0t eligible), ' +
          '1 dated before 2026-01 (88t credited, 0t eligible), ' +
          '1 dated after 2026-03 (7t credited, 0t eligible)',
        event: expect.objectContaining({ reference: 'acc-500001' })
      })
    )
  })

  it('reports the tonnage the waste balance holds for rows dated before the window, where the accreditation started before it', async () => {
    const { organisation, accreditationId, ledgerEntry } = makeAccreditation({
      orgId: 500001,
      validFrom: '2025-01-01'
    })

    const { report, logger } = run({
      organisations: [organisation],
      entries: [ledgerEntry],
      rowStatesByAccreditationId: {
        [accreditationId]: [receivedRow('2025-06-01', 40)]
      }
    })

    await report

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining(
          '1 dated before 2026-01 (40t credited, 40t eligible)'
        )
      })
    )
  })

  it('does not log when no rows are skipped', async () => {
    const { organisation, accreditationId, ledgerEntry } = makeAccreditation({
      orgId: 500001
    })

    const { report, logger } = run({
      organisations: [organisation],
      entries: [ledgerEntry],
      rowStatesByAccreditationId: {
        [accreditationId]: [receivedRow('2026-02-10', 10)]
      }
    })

    await report

    expect(logger.info).not.toHaveBeenCalled()
  })

  it('returns an empty data array when there are no submitted accreditations', async () => {
    const { report } = run({ organisations: [], entries: [] })

    expect(await report).toEqual({
      meta: { generatedAt: NOW.toISOString() },
      data: []
    })
  })

  it('credits a row the submission stamped as excluded once the accreditation period covers it', async () => {
    const { organisation, accreditationId, ledgerEntry } = makeAccreditation({
      orgId: 500001,
      validFrom: '2026-02-01'
    })

    const { report } = run({
      organisations: [organisation],
      entries: [ledgerEntry],
      rowStatesByAccreditationId: {
        // Stamped EXCLUDED with a zero transaction amount when it was
        // submitted; the widened period now covers it.
        [accreditationId]: [receivedRow('2026-02-10', 100)]
      }
    })

    expect(
      (await report).data.find((row) => row.month === '2026-02')?.tonnage
    ).toEqual({
      totalCredited: 100,
      eligibleForWasteBalance: 100,
      sentOnDeductions: 0
    })
  })

  it('stops crediting a row once the accreditation period no longer covers it', async () => {
    const { organisation, accreditationId, ledgerEntry } = makeAccreditation({
      orgId: 500001,
      validFrom: '2026-03-01'
    })

    const { report } = run({
      organisations: [organisation],
      entries: [ledgerEntry],
      rowStatesByAccreditationId: {
        // Stamped INCLUDED for its full tonnage when it was submitted; the
        // narrowed period no longer covers it.
        [accreditationId]: [
          receivedRow('2026-02-10', 100, stampedIncluded(100))
        ]
      }
    })

    // Gross tonnage is what the operator reported and does not move; only the
    // balance-eligible figure follows the accreditation period.
    expect(
      (await report).data.find((row) => row.month === '2026-02')?.tonnage
    ).toEqual({
      totalCredited: 100,
      eligibleForWasteBalance: 0,
      sentOnDeductions: 0
    })
  })

  it('credits an exported row once its overseas site approval covers the export date', async () => {
    const { organisation, accreditationId, ledgerEntry } = makeAccreditation({
      orgId: 500001,
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
      overseasSites: overseasSite({ approvedOn: '2026-01-01' })
    })

    const { report } = run({
      organisations: [organisation],
      entries: [ledgerEntry],
      rowStatesByAccreditationId: {
        [accreditationId]: [exportedRow('2026-02-10', 60)]
      }
    })

    expect(
      (await report).data.find((row) => row.month === '2026-02')?.tonnage
    ).toEqual({
      totalCredited: 60,
      eligibleForWasteBalance: 60,
      sentOnDeductions: 0
    })
  })

  // Accepted behaviour change: an approval date is the start of its day, so an
  // export dated (DATE_OF_EXPORT 2026-01-20) on the approval day is approved (the legacy report withheld it).
  it('credits an exported row dated on its overseas site approval day', async () => {
    const { organisation, accreditationId, ledgerEntry } = makeAccreditation({
      orgId: 500001,
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
      overseasSites: overseasSite({ approvedOn: '2026-01-20' })
    })

    const { report } = run({
      organisations: [organisation],
      entries: [ledgerEntry],
      rowStatesByAccreditationId: {
        [accreditationId]: [exportedRow('2026-02-10', 60)]
      }
    })

    expect(
      (await report).data.find((row) => row.month === '2026-02')?.tonnage
    ).toEqual({
      totalCredited: 60,
      eligibleForWasteBalance: 60,
      sentOnDeductions: 0
    })
  })

  it('withholds credit from an exported row whose overseas site is not yet approved', async () => {
    const { organisation, accreditationId, ledgerEntry } = makeAccreditation({
      orgId: 500001,
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER,
      overseasSites: overseasSite()
    })

    const { report } = run({
      organisations: [organisation],
      entries: [ledgerEntry],
      rowStatesByAccreditationId: {
        [accreditationId]: [exportedRow('2026-02-10', 60, stampedIncluded(60))]
      }
    })

    expect(
      (await report).data.find((row) => row.month === '2026-02')?.tonnage
    ).toEqual({
      totalCredited: 60,
      eligibleForWasteBalance: 0,
      sentOnDeductions: 0
    })
  })

  it('excludes registered-only ledger entries (accreditationId null) without warning', async () => {
    const { organisation, accreditationId, ledgerEntry } = makeAccreditation({
      orgId: 500001
    })
    const registeredOnlyEntry = {
      ledgerId: {
        organisationId: 'org-registered-only',
        registrationId: 'reg-registered-only',
        accreditationId: null,
        organisationNumber: '500099',
        registrationNumber: 'REG-500099',
        accreditationNumber: null
      },
      summaryLogId: 'log-registered-only'
    }

    const { report, logger } = run({
      organisations: [organisation],
      entries: [ledgerEntry, registeredOnlyEntry],
      rowStatesByAccreditationId: {
        [accreditationId]: [receivedRow('2026-02-10', 100)]
      }
    })

    const { data } = await report
    expect(data.every((row) => row.accreditation.id === accreditationId)).toBe(
      true
    )
    expect(logger.warn).not.toHaveBeenCalled()
  })
})

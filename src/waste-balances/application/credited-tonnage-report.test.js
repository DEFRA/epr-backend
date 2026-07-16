import { buildCreditedTonnageReport } from './credited-tonnage-report.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import {
  MATERIAL,
  GLASS_RECYCLING_PROCESS,
  WASTE_PROCESSING_TYPE,
  REPROCESSING_TYPE
} from '#domain/organisations/model.js'

/**
 * @typedef {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} LedgerRepository
 * @typedef {import('#waste-records/repository/port.js').SummaryLogRowStateRepository} RowStateRepository
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 * @typedef {import('#common/hapi-types.js').TypedLogger} TypedLogger
 */

// The test environment configures 999999 as a test organisation
// (.vite/setup-files.js sets TEST_ORGANISATIONS='[999999]').
const TEST_ORG_ID = 999999

// A fixed clock: January 2026 → March 2026 is the report window.
const NOW = new Date('2026-03-15T12:00:00.000Z')

/**
 * @param {{
 *   orgId: number,
 *   material?: string,
 *   glassRecyclingProcess?: string[],
 *   wasteProcessingType?: string,
 *   reprocessingType?: string,
 *   accreditationNumber?: string | null,
 *   status?: string
 * }} options - pass `accreditationNumber: null` to omit it entirely
 */
const makeAccreditation = ({
  orgId,
  material = MATERIAL.PLASTIC,
  glassRecyclingProcess,
  wasteProcessingType = WASTE_PROCESSING_TYPE.REPROCESSOR,
  reprocessingType = REPROCESSING_TYPE.INPUT,
  accreditationNumber,
  status = 'approved'
}) => {
  const id = `org-uuid-${orgId}`
  const registrationId = `reg-${orgId}`
  const accreditationId = `acc-${orgId}`
  const registration = {
    id: registrationId,
    accreditationId,
    material,
    glassRecyclingProcess,
    wasteProcessingType,
    reprocessingType
  }
  const accreditation = {
    id: accreditationId,
    status,
    material,
    wasteProcessingType,
    reprocessingType,
    ...(accreditationNumber !== null && {
      accreditationNumber: accreditationNumber ?? `ACC-${orgId}`
    })
  }
  const organisation = {
    id,
    orgId,
    registrations: [registration],
    accreditations: [accreditation]
  }
  return {
    organisation,
    accreditationId,
    ledgerEntry: {
      ledgerId: {
        organisationId: id,
        registrationId,
        accreditationId
      },
      summaryLogId: `log-${orgId}`
    }
  }
}

const receivedRow = (
  date,
  tonnage,
  { outcome = WASTE_BALANCE_OUTCOME.INCLUDED, transactionAmount = tonnage } = {}
) => ({
  rowId: `row-${date}-${tonnage}`,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: {
    DATE_RECEIVED_FOR_REPROCESSING: date,
    TONNAGE_RECEIVED_FOR_RECYCLING: tonnage
  },
  classification: { outcome, reasons: [], transactionAmount }
})

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
  const summaryLogRowStateRepository = {
    findRowStatesForSummaryLog: async (
      /** @type {{ accreditationId: string }} */ ledgerId
    ) => rowStatesByAccreditationId[ledgerId.accreditationId] ?? []
  }
  const organisationsRepository = { findAll: async () => organisations }

  return {
    logger,
    report: buildCreditedTonnageReport({
      ledgerRepository: /** @type {LedgerRepository} */ (
        /** @type {unknown} */ (ledgerRepository)
      ),
      summaryLogRowStateRepository: /** @type {RowStateRepository} */ (
        /** @type {unknown} */ (summaryLogRowStateRepository)
      ),
      organisationsRepository: /** @type {OrganisationsRepository} */ (
        /** @type {unknown} */ (organisationsRepository)
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
            deductibleFromCredited: 0
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
            deductibleFromCredited: 0
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
            deductibleFromCredited: 0
          }
        }
      ]
    })
  })

  it('splits glass into re-melt and other via the registration glassRecyclingProcess', async () => {
    const reMelt = makeAccreditation({
      orgId: 500001,
      material: MATERIAL.GLASS,
      glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT]
    })
    const other = makeAccreditation({
      orgId: 500002,
      material: MATERIAL.GLASS,
      glassRecyclingProcess: [GLASS_RECYCLING_PROCESS.GLASS_OTHER]
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
      id: 'org-uuid-500007',
      orgId: 500007,
      registrations: [
        {
          id: 'reg-500007',
          material: MATERIAL.PLASTIC,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          reprocessingType: REPROCESSING_TYPE.INPUT
        }
      ],
      accreditations: []
    }

    const { report, logger } = run({
      organisations: [registeredOnly],
      entries: []
    })

    expect((await report).data).toEqual([])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('warns once for a ledger entry whose accreditation is missing from its organisation', async () => {
    const orphanOrg = {
      id: 'org-uuid-500008',
      orgId: 500008,
      registrations: [
        {
          id: 'reg-500008',
          accreditationId: 'acc-dangling',
          material: MATERIAL.PLASTIC,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          reprocessingType: REPROCESSING_TYPE.INPUT
        }
      ],
      accreditations: []
    }

    const { report, logger } = run({
      organisations: [orphanOrg],
      entries: [
        {
          ledgerId: {
            organisationId: 'org-uuid-500008',
            registrationId: 'reg-500008',
            accreditationId: 'acc-dangling'
          },
          summaryLogId: 'log-dangling'
        }
      ]
    })

    expect((await report).data).toEqual([])
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: expect.objectContaining({ reference: 'acc-dangling' })
      })
    )
  })

  it('emits an empty accreditationNumber when the accreditation has none', async () => {
    const { organisation, accreditationId, ledgerEntry } = makeAccreditation({
      orgId: 500001,
      status: 'cancelled',
      accreditationNumber: null
    })

    const { report } = run({
      organisations: [organisation],
      entries: [ledgerEntry],
      rowStatesByAccreditationId: {
        [accreditationId]: [receivedRow('2026-02-10', 10)]
      }
    })

    expect(
      (await report).data.every(
        (r) => r.accreditation.accreditationNumber === ''
      )
    ).toBe(true)
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
          r.tonnage.deductibleFromCredited === 0
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
      deductibleFromCredited: 0
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
    const twoAccreditationOrg = {
      id: 'org-uuid-500005',
      orgId: 500005,
      registrations: [
        { id: 'reg-a', accreditationId: 'acc-a', ...commonFields },
        { id: 'reg-b', accreditationId: 'acc-b', ...commonFields }
      ],
      accreditations: [
        {
          id: 'acc-a',
          accreditationNumber: 'ACC-A',
          status: 'approved',
          ...commonFields
        },
        {
          id: 'acc-b',
          accreditationNumber: 'ACC-B',
          status: 'approved',
          ...commonFields
        }
      ]
    }

    const { report } = run({
      organisations: [twoAccreditationOrg],
      entries: [
        {
          ledgerId: {
            organisationId: 'org-uuid-500005',
            registrationId: 'reg-a',
            accreditationId: 'acc-a'
          },
          summaryLogId: 'log-a'
        },
        {
          ledgerId: {
            organisationId: 'org-uuid-500005',
            registrationId: 'reg-b',
            accreditationId: 'acc-b'
          },
          summaryLogId: 'log-b'
        }
      ],
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

  it('logs one structured line per accreditation whose rows were skipped for a bad date', async () => {
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
          receivedRow('2025-01-01', 88)
        ]
      }
    })

    await report

    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('skipped 2 row(s)'),
        event: expect.objectContaining({ reference: 'acc-500001' })
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
})

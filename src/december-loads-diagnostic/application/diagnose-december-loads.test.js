import { buildDecemberLoadsReport } from './diagnose-december-loads.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
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

const receivedRow = (date) => ({
  rowId: `received-${date}`,
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: { DATE_RECEIVED_FOR_REPROCESSING: date }
})

const sentOnRow = (date) => ({
  rowId: `sent-on-${date}`,
  wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
  data: { DATE_LOAD_LEFT_SITE: date }
})

const exportedRow = (date) => ({
  rowId: `exported-${date}`,
  wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
  data: {
    DATE_RECEIVED_BY_OSR: date,
    DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No'
  }
})

const processedRow = (date) => ({
  rowId: `processed-${date}`,
  wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
  data: { DATE_LOAD_LEFT_SITE: date }
})

/**
 * @param {{
 *   organisations: any[],
 *   entries: any[],
 *   rowStatesByAccreditationId?: Record<string, any[]>
 * }} options
 */
const run = async ({
  organisations,
  entries,
  rowStatesByAccreditationId = {}
}) => {
  const logger = { info: vi.fn(), warn: vi.fn() }
  const ledgerRepository = {
    findLatestSubmittedSummaryLogPerLedger: async () => entries
  }
  const summaryLogRowStatesRepository = {
    findRowStatesForSummaryLog: async (
      /** @type {{ accreditationId: string }} */ ledgerId
    ) => rowStatesByAccreditationId[ledgerId.accreditationId] ?? []
  }
  const organisationsRepository = { findAll: async () => organisations }

  return {
    logger,
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
  it('reports an exporter summary log holding December-received exported loads', async () => {
    const { organisation, accreditationId, entry } = makeAccreditation({
      orgId: 500001,
      wasteProcessingType: WASTE_PROCESSING_TYPE.EXPORTER
    })

    const { report } = await run({
      organisations: [organisation],
      entries: [entry],
      rowStatesByAccreditationId: {
        [accreditationId]: [
          exportedRow('2026-12-05'),
          exportedRow('2026-06-01')
        ]
      }
    })

    expect(report.reports).toEqual([
      {
        organisationId: 'org-uuid-500001',
        organisationReference: '500001',
        accreditationId,
        accreditationNumber: 'ACC-500001',
        processingType: 'EXPORTER',
        decemberKey: '2026-12',
        decemberRowCount: 1
      }
    ])
    expect(report.summary).toEqual({
      scannedAccreditations: 1,
      affectedAccreditations: 1,
      totalDecemberRows: 1
    })
  })

  it('counts reprocessor-input received and sent-on December rows in either direction', async () => {
    const { organisation, accreditationId, entry } = makeAccreditation({
      orgId: 500002
    })

    const { report } = await run({
      organisations: [organisation],
      entries: [entry],
      rowStatesByAccreditationId: {
        [accreditationId]: [
          receivedRow('2026-12-01'),
          sentOnRow('2026-12-20'),
          receivedRow('2026-05-01')
        ]
      }
    })

    expect(report.reports[0].decemberRowCount).toBe(2)
    expect(report.summary.totalDecemberRows).toBe(2)
  })

  it('never reports a reprocessor-output summary log, even with December processed loads', async () => {
    const { organisation, accreditationId, entry } = makeAccreditation({
      orgId: 500003,
      reprocessingType: REPROCESSING_TYPE.OUTPUT
    })

    const { report } = await run({
      organisations: [organisation],
      entries: [entry],
      rowStatesByAccreditationId: {
        [accreditationId]: [processedRow('2026-12-05')]
      }
    })

    expect(report.reports).toEqual([])
    expect(report.summary).toEqual({
      scannedAccreditations: 1,
      affectedAccreditations: 0,
      totalDecemberRows: 0
    })
  })

  it('scans but does not report an accreditation with no December rows', async () => {
    const { organisation, accreditationId, entry } = makeAccreditation({
      orgId: 500004
    })

    const { report } = await run({
      organisations: [organisation],
      entries: [entry],
      rowStatesByAccreditationId: {
        [accreditationId]: [receivedRow('2026-06-01')]
      }
    })

    expect(report.reports).toEqual([])
    expect(report.summary).toEqual({
      scannedAccreditations: 1,
      affectedAccreditations: 0,
      totalDecemberRows: 0
    })
  })

  it('skips registered-only entries with no accreditation', async () => {
    const { organisation } = makeAccreditation({ orgId: 500005 })

    const { report } = await run({
      organisations: [organisation],
      entries: [
        {
          ledgerId: {
            organisationId: 'org-uuid-500005',
            registrationId: 'reg-500005',
            accreditationId: null
          },
          summaryLogId: 'log-ro-500005'
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
        [accreditationId]: [receivedRow('2026-12-01')]
      }
    })

    expect(report.reports).toEqual([])
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('indexes an organisation that also carries a registered-only registration', async () => {
    const { organisation, accreditationId, entry } = makeAccreditation({
      orgId: 500006
    })
    organisation.registrations.push(
      /** @type {any} */ ({
        id: 'reg-ro-500006',
        accreditationId: null,
        wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
        reprocessingType: REPROCESSING_TYPE.INPUT
      })
    )

    const { report } = await run({
      organisations: [organisation],
      entries: [entry],
      rowStatesByAccreditationId: {
        [accreditationId]: [receivedRow('2026-12-01')]
      }
    })

    expect(report.reports).toHaveLength(1)
    expect(report.summary.scannedAccreditations).toBe(1)
  })

  it('tie-breaks by accreditation id and renders an empty accreditation number', async () => {
    const registrationA = {
      id: 'reg-a-500007',
      accreditationId: 'acc-a-500007',
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
      reprocessingType: REPROCESSING_TYPE.INPUT
    }
    const registrationB = {
      id: 'reg-b-500007',
      accreditationId: 'acc-b-500007',
      wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
      reprocessingType: REPROCESSING_TYPE.INPUT
    }
    const organisation = {
      id: 'org-uuid-500007',
      orgId: 500007,
      registrations: [registrationA, registrationB],
      accreditations: [
        {
          id: 'acc-b-500007',
          status: 'approved',
          validFrom: VALID_FROM,
          validTo: VALID_TO,
          wasteProcessingType: WASTE_PROCESSING_TYPE.REPROCESSOR,
          reprocessingType: REPROCESSING_TYPE.INPUT
        },
        {
          id: 'acc-a-500007',
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
            organisationId: 'org-uuid-500007',
            registrationId: 'reg-a-500007',
            accreditationId: 'acc-a-500007'
          },
          summaryLogId: 'log-a-500007'
        },
        {
          ledgerId: {
            organisationId: 'org-uuid-500007',
            registrationId: 'reg-b-500007',
            accreditationId: 'acc-b-500007'
          },
          summaryLogId: 'log-b-500007'
        }
      ],
      rowStatesByAccreditationId: {
        'acc-a-500007': [receivedRow('2026-12-01')],
        'acc-b-500007': [receivedRow('2026-12-02')]
      }
    })

    expect(report.reports.map((r) => r.accreditationId)).toEqual([
      'acc-a-500007',
      'acc-b-500007'
    ])
    expect(report.reports[1].accreditationNumber).toBe('')
  })

  it('aggregates and sorts across many accreditations by organisation reference', async () => {
    const a = makeAccreditation({ orgId: 500020 })
    const b = makeAccreditation({ orgId: 500010 })

    const { report } = await run({
      organisations: [a.organisation, b.organisation],
      entries: [a.entry, b.entry],
      rowStatesByAccreditationId: {
        [a.accreditationId]: [receivedRow('2026-12-01')],
        [b.accreditationId]: [
          receivedRow('2026-12-01'),
          sentOnRow('2026-12-02')
        ]
      }
    })

    expect(report.reports.map((r) => r.organisationReference)).toEqual([
      '500010',
      '500020'
    ])
    expect(report.summary).toEqual({
      scannedAccreditations: 2,
      affectedAccreditations: 2,
      totalDecemberRows: 3
    })
  })
})

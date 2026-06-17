import {
  streamCsvExport,
  streamCsvExportToReadable
} from './stream-csv-export.js'
import {
  METADATA_COLUMNS,
  buildDataFieldColumns,
  buildHeaderRow
} from '../domain/csv-columns.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { createInMemoryRowStateRepository } from '#waste-balances/repository/row-states-inmemory.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'

const collect = async (gen) => {
  const out = []
  for await (const row of gen) out.push(row)
  return out
}

const cellsOf = (line) => line.trim().split(',')

const dataCellIndex = (observedKeys, field) =>
  METADATA_COLUMNS.length + buildDataFieldColumns(observedKeys).indexOf(field)

const accreditationFixture = {
  id: 'acc-1',
  status: 'approved',
  accreditationNumber: 'ACC-001',
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
  statusHistory: []
}

const baseOrg = (overrides = {}) => ({
  id: 'org-1',
  orgId: 123456,
  companyDetails: { name: 'Acme Ltd' },
  submittedToRegulator: 'ea',
  registrations: [],
  accreditations: [accreditationFixture],
  ...overrides
})

const baseRegistration = (overrides = {}) => ({
  id: 'reg-1',
  material: 'plastic',
  submittedToRegulator: 'ea',
  accreditationId: 'acc-1',
  ...overrides
})

const ACCREDITED_PARTITION = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: 'acc-1'
}

const receivedData = (overrides = {}) => ({
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
  ...overrides
})

const includedEntry = (overrides = {}) => ({
  rowId: '1001',
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  data: receivedData(),
  classification: {
    outcome: ROW_OUTCOME.INCLUDED,
    reasons: [],
    transactionAmount: 10
  },
  ...overrides
})

/**
 * @typedef {{ organisationId: string, registrationId: string, accreditationId: string | null }} Partition
 * @typedef {{ summaryLogId: string, number: number, entries: any[], partition?: Partition }} Submission
 */

/**
 * Seed committed row states + their stream submissions into fresh in-memory
 * adapters. Each submission upserts its entries under a partition and appends a
 * matching summary-log-submitted event so the head resolves to the latest.
 *
 * @param {Submission[]} submissions
 */
const seedRepos = async (submissions) => {
  const rowStateRepository = createInMemoryRowStateRepository()()
  const events = []
  for (const submission of submissions) {
    const partition = submission.partition ?? ACCREDITED_PARTITION
    await rowStateRepository.upsertRowStates(
      partition,
      submission.entries,
      submission.summaryLogId
    )
    events.push(
      buildStreamEvent({
        registrationId: partition.registrationId,
        accreditationId: partition.accreditationId,
        organisationId: partition.organisationId,
        number: submission.number,
        payload: { summaryLogId: submission.summaryLogId, creditTotal: 100 }
      })
    )
  }
  return {
    rowStateRepository,
    streamRepository: createInMemoryStreamRepository(events)()
  }
}

/**
 * @param {{ orgs?: any[], summaryLogs?: any[], observedKeys?: string[], rowStateRepository?: any, streamRepository?: any }} [opts]
 */
const buildDeps = ({
  orgs = [],
  summaryLogs = [],
  observedKeys = [],
  rowStateRepository = createInMemoryRowStateRepository()(),
  streamRepository = createInMemoryStreamRepository()()
} = {}) => ({
  organisationsRepository: { findAll: vi.fn().mockResolvedValue(orgs) },
  wasteRecordsRepository: {
    findDistinctDataKeys: vi.fn().mockResolvedValue(observedKeys)
  },
  summaryLogsRepository: {
    findAllByOrgReg: vi.fn().mockResolvedValue(summaryLogs)
  },
  streamRepository,
  rowStateRepository
})

describe('streamCsvExport', () => {
  it('emits the header row even when no organisations exist', async () => {
    const out = await collect(streamCsvExport(buildDeps()))
    expect(out).toHaveLength(1)
    expect(out[0].endsWith('\n')).toBe(true)
    for (const column of METADATA_COLUMNS) {
      expect(out[0]).toContain(column)
    }
    for (const column of buildHeaderRow(buildDataFieldColumns([]))) {
      expect(out[0]).toContain(column)
    }
  })

  it('emits one data row per committed row state with org/registration/state/summaryLog data populated', async () => {
    const { rowStateRepository, streamRepository } = await seedRepos([
      { summaryLogId: 'log-1', number: 1, entries: [includedEntry()] }
    ])
    const deps = buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      summaryLogs: [
        { id: 'log-1', summaryLog: { submittedAt: '2026-04-15T09:00:00Z' } }
      ],
      rowStateRepository,
      streamRepository
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(2)
    expect(out[1]).toContain('Acme Ltd')
    expect(out[1]).toContain('EA') // uppercased regulator
    expect(out[1]).toContain('plastic')
    expect(out[1]).toContain('REPROCESSOR_INPUT')
    expect(out[1]).toContain('received')
    expect(out[1]).toContain('2026-04-15T09:00:00Z')
    expect(out[1]).toContain('1001')
    expect(deps.summaryLogsRepository.findAllByOrgReg).toHaveBeenCalledWith(
      'org-1',
      'reg-1'
    )
  })

  it('reads inclusion from the stamped classification rather than recomputing it', async () => {
    const { rowStateRepository, streamRepository } = await seedRepos([
      {
        summaryLogId: 'log-1',
        number: 1,
        entries: [
          includedEntry({ rowId: '1001' }),
          includedEntry({
            rowId: '1002',
            classification: {
              outcome: ROW_OUTCOME.EXCLUDED,
              reasons: [{ code: 'PRN_ISSUED' }],
              transactionAmount: 0
            }
          })
        ]
      }
    ])
    const deps = buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      rowStateRepository,
      streamRepository
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(3)
    // Included in Waste Balance is metadata column index 9.
    expect(cellsOf(out[1])[9]).toBe('"true"') // rowId 1001 INCLUDED
    expect(cellsOf(out[2])[9]).toBe('"false"') // rowId 1002 EXCLUDED
  })

  it('exports a single coerced type for a column that arrived mixed-typed across submissions', async () => {
    const observedKeys = ['processingType', 'GROSS_WEIGHT']
    const { rowStateRepository, streamRepository } = await seedRepos([
      {
        summaryLogId: 'log-1',
        number: 1,
        entries: [
          includedEntry({
            rowId: '1001',
            data: receivedData({ GROSS_WEIGHT: 9 }) // number from ExcelJS
          }),
          includedEntry({
            rowId: '1002',
            data: receivedData({ GROSS_WEIGHT: '9.0' }) // numeric-string from ExcelJS
          })
        ]
      }
    ])
    const deps = buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      observedKeys,
      rowStateRepository,
      streamRepository
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(3)
    const grossIdx = dataCellIndex(observedKeys, 'GROSS_WEIGHT')
    // The PAE-1560 discrepancy was that number 9 exported as "9" while the
    // numeric-string "9.0" exported as "9.0". Read-time coercion lands both on
    // the schema's canonical number, so the column is single-typed.
    expect(cellsOf(out[1])[grossIdx]).toBe('"9"')
    expect(cellsOf(out[2])[grossIdx]).toBe('"9"')
    expect(cellsOf(out[1])[grossIdx]).toBe(cellsOf(out[2])[grossIdx])
  })

  it('passes data through uncoerced when no schema matches the processing type', async () => {
    const observedKeys = ['processingType', 'GROSS_WEIGHT']
    const { rowStateRepository, streamRepository } = await seedRepos([
      {
        summaryLogId: 'log-1',
        number: 1,
        entries: [
          includedEntry({
            data: { processingType: 'UNKNOWN_TYPE', GROSS_WEIGHT: '9.0' }
          })
        ]
      }
    ])
    const deps = buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      observedKeys,
      rowStateRepository,
      streamRepository
    })

    const out = await collect(streamCsvExport(deps))
    const grossIdx = dataCellIndex(observedKeys, 'GROSS_WEIGHT')
    expect(cellsOf(out[1])[grossIdx]).toBe('"9.0"') // raw, no schema to coerce
  })

  it('emits registration and accreditation numbers and the detailed glass material', async () => {
    const { rowStateRepository, streamRepository } = await seedRepos([
      { summaryLogId: 'log-1', number: 1, entries: [includedEntry()] }
    ])
    const deps = buildDeps({
      orgs: [
        baseOrg({
          registrations: [
            baseRegistration({
              registrationNumber: 'REG-555',
              material: 'glass',
              glassRecyclingProcess: ['glass_re_melt']
            })
          ]
        })
      ],
      rowStateRepository,
      streamRepository
    })

    const out = await collect(streamCsvExport(deps))
    const cells = cellsOf(out[1])
    expect(cells[2]).toBe('"REG-555"') // Registration Number
    expect(cells[3]).toBe('"glass_re_melt"') // Material (detailed)
    expect(cells[5]).toBe('"Yes"') // Accredited
    expect(cells[6]).toBe('"ACC-001"') // Accreditation Number
  })

  it('treats a registration with no accreditation as registered-only', async () => {
    const partition = { ...ACCREDITED_PARTITION, accreditationId: null }
    const { rowStateRepository, streamRepository } = await seedRepos([
      {
        summaryLogId: 'log-1',
        number: 1,
        entries: [includedEntry()],
        partition
      }
    ])
    const deps = buildDeps({
      orgs: [
        baseOrg({
          accreditations: [],
          registrations: [baseRegistration({ accreditationId: null })]
        })
      ],
      rowStateRepository,
      streamRepository
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(2)
    const cells = cellsOf(out[1])
    expect(cells[5]).toBe('"No"') // Accredited
    expect(cells[6]).toBe('""') // Accreditation Number
  })

  it('emits empty Submitted At when the head submission is absent from the summary-log map', async () => {
    const { rowStateRepository, streamRepository } = await seedRepos([
      { summaryLogId: 'log-1', number: 1, entries: [includedEntry()] }
    ])
    const deps = buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      summaryLogs: [],
      rowStateRepository,
      streamRepository
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(2)
    expect(cellsOf(out[1])[8]).toBe('""') // Submitted At
  })

  it('emits no rows for a registration with no committed submission', async () => {
    const deps = buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })]
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(1) // header only
  })

  it('emits committed rows sorted by (wasteRecordType, rowId)', async () => {
    const { rowStateRepository, streamRepository } = await seedRepos([
      {
        summaryLogId: 'log-1',
        number: 1,
        entries: [
          includedEntry({
            rowId: '4001',
            wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
            data: { processingType: PROCESSING_TYPES.EXPORTER }
          }),
          includedEntry({
            rowId: '1001',
            wasteRecordType: WASTE_RECORD_TYPE.RECEIVED
          }),
          includedEntry({
            rowId: '3001',
            wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
            data: { processingType: PROCESSING_TYPES.EXPORTER }
          })
        ]
      }
    ])
    const deps = buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      rowStateRepository,
      streamRepository
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(4)
    expect(out[1]).toContain('exported')
    expect(out[2]).toContain('received')
    expect(out[3]).toContain('sentOn')
  })

  it('orders rowIds naturally so "9" comes before "10"', async () => {
    const { rowStateRepository, streamRepository } = await seedRepos([
      {
        summaryLogId: 'log-1',
        number: 1,
        entries: [includedEntry({ rowId: '10' }), includedEntry({ rowId: '9' })]
      }
    ])
    const deps = buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      rowStateRepository,
      streamRepository
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(3)
    expect(out[1]).toContain('"9"')
    expect(out[2]).toContain('"10"')
  })

  it('iterates organisations and registrations sorted by id for deterministic output', async () => {
    const { rowStateRepository, streamRepository } = await seedRepos([
      {
        summaryLogId: 'log-x',
        number: 1,
        entries: [includedEntry({ rowId: 'rx' })],
        partition: {
          organisationId: 'org-a',
          registrationId: 'reg-x',
          accreditationId: 'acc-1'
        }
      },
      {
        summaryLogId: 'log-1',
        number: 1,
        entries: [includedEntry({ rowId: 'r1' })],
        partition: {
          organisationId: 'org-b',
          registrationId: 'reg-1',
          accreditationId: 'acc-1'
        }
      },
      {
        summaryLogId: 'log-2',
        number: 1,
        entries: [includedEntry({ rowId: 'r2' })],
        partition: {
          organisationId: 'org-b',
          registrationId: 'reg-2',
          accreditationId: 'acc-1'
        }
      }
    ])
    const orgB = baseOrg({
      id: 'org-b',
      companyDetails: { name: 'Beta' },
      registrations: [
        baseRegistration({ id: 'reg-2' }),
        baseRegistration({ id: 'reg-1' })
      ]
    })
    const orgA = baseOrg({
      id: 'org-a',
      companyDetails: { name: 'Alpha' },
      registrations: [baseRegistration({ id: 'reg-x' })]
    })
    const deps = buildDeps({
      orgs: [orgB, orgA],
      rowStateRepository,
      streamRepository
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(4)
    expect(out[1]).toContain('rx') // org-a / reg-x
    expect(out[2]).toContain('r1') // org-b / reg-1
    expect(out[3]).toContain('r2') // org-b / reg-2
  })

  it('skips organisations that have no registrations array', async () => {
    const deps = buildDeps({ orgs: [baseOrg({ registrations: undefined })] })
    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(1) // header only
  })

  it('excludes organisations configured as test organisations', async () => {
    const { rowStateRepository, streamRepository } = await seedRepos([
      { summaryLogId: 'log-1', number: 1, entries: [includedEntry()] }
    ])
    const testOrg = baseOrg({
      id: 'org-test',
      orgId: 999999,
      companyDetails: { name: 'Test Org' },
      registrations: [baseRegistration({ id: 'reg-test' })]
    })
    const realOrg = baseOrg({ registrations: [baseRegistration()] })
    const deps = buildDeps({
      orgs: [testOrg, realOrg],
      rowStateRepository,
      streamRepository
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(2) // header + the real org only
    expect(out[1]).toContain('Acme Ltd')
    expect(out[1]).not.toContain('Test Org')
  })

  it('propagates errors from the committed-state reads', async () => {
    const streamRepository = createInMemoryStreamRepository()()
    vi.spyOn(
      streamRepository,
      'findLatestByPartitionAndKind'
    ).mockRejectedValue(new Error('cursor died'))
    const deps = buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      streamRepository
    })

    await expect(collect(streamCsvExport(deps))).rejects.toThrow('cursor died')
  })
})

describe('streamCsvExportToReadable', () => {
  it('returns a Readable stream that emits the same lines as the generator', async () => {
    const readable = streamCsvExportToReadable(buildDeps())
    const chunks = []
    for await (const chunk of readable) {
      chunks.push(chunk.toString('utf8'))
    }
    expect(chunks).toHaveLength(1)
    for (const column of buildHeaderRow(buildDataFieldColumns([]))) {
      expect(chunks[0]).toContain(column)
    }
  })

  it('includes runtime-observed data keys in the header and emits their values', async () => {
    const observedKeys = [
      'processingType',
      'DATE_RECEIVED_FOR_REPROCESSING',
      'BILL_OF_LANDING_REFERENCE_NUMBER'
    ]
    const { rowStateRepository, streamRepository } = await seedRepos([
      {
        summaryLogId: 'log-1',
        number: 1,
        entries: [
          includedEntry({
            data: receivedData({ BILL_OF_LANDING_REFERENCE_NUMBER: 'BL-99' })
          })
        ]
      }
    ])
    const deps = buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      observedKeys,
      rowStateRepository,
      streamRepository
    })

    const out = await collect(streamCsvExport(deps))
    expect(out[0]).toContain('BILL_OF_LANDING_REFERENCE_NUMBER')
    expect(out[1]).toContain('BL-99')
  })
})

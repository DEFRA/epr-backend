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

const collect = async (gen) => {
  const out = []
  for await (const row of gen) out.push(row)
  return out
}

const baseOrg = (overrides = {}) => ({
  id: 'org-1',
  companyDetails: { name: 'Acme Ltd' },
  submittedToRegulator: 'ea',
  registrations: [],
  ...overrides
})

const baseRegistration = (overrides = {}) => ({
  id: 'reg-1',
  material: 'plastic',
  submittedToRegulator: 'ea',
  accreditation: {
    id: 'acc-1',
    validFrom: '2026-01-01',
    validTo: '2027-01-01',
    statusHistory: []
  },
  overseasSites: {},
  ...overrides
})

const reprocessorReceivedRecord = (overrides = {}) => ({
  type: WASTE_RECORD_TYPE.RECEIVED,
  rowId: '1001',
  data: {
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
    DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01'
  },
  versions: [{ summaryLog: { id: 'sl-1' } }],
  ...overrides
})

const defaultDeps = () => ({
  organisationsRepository: {
    findAll: vi.fn().mockResolvedValue([])
  },
  wasteRecordsRepository: {
    findByRegistration: vi.fn().mockResolvedValue([]),
    findDistinctDataKeys: vi.fn().mockResolvedValue([])
  },
  summaryLogsRepository: {
    findAllByOrgReg: vi.fn().mockResolvedValue([])
  },
  overseasSitesRepository: {
    findAll: vi.fn().mockResolvedValue([])
  }
})

// Shallow-merges per-repo overrides so individual tests can swap a single
// method (e.g. `findByRegistration`) without losing the default mocks for
// other methods on the same repository.
const baseDeps = (overrides = {}) => {
  const merged = defaultDeps()
  for (const [key, value] of Object.entries(overrides)) {
    merged[key] = { ...merged[key], ...value }
  }
  return merged
}

describe('streamCsvExport', () => {
  it('emits the header row even when no organisations exist', async () => {
    const out = await collect(streamCsvExport(baseDeps()))
    expect(out).toHaveLength(1)
    // The header row is CSV-encoded and ends with a newline
    expect(out[0].endsWith('\n')).toBe(true)
    for (const column of METADATA_COLUMNS) {
      expect(out[0]).toContain(column)
    }
    for (const column of buildHeaderRow(buildDataFieldColumns([]))) {
      expect(out[0]).toContain(column)
    }
  })

  it('emits one data row per waste record with org/registration/record/summaryLog data populated', async () => {
    const org = baseOrg({
      registrations: [baseRegistration()]
    })
    const record = reprocessorReceivedRecord()
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi.fn().mockResolvedValue([record])
      },
      summaryLogsRepository: {
        findAllByOrgReg: vi.fn().mockResolvedValue([
          {
            id: 'sl-1',
            summaryLog: { submittedAt: '2026-04-15T09:00:00Z' }
          }
        ])
      }
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
    expect(deps.wasteRecordsRepository.findByRegistration).toHaveBeenCalledWith(
      'org-1',
      'reg-1'
    )
  })

  it('emits empty Submitted At when the record references a missing summary log', async () => {
    const org = baseOrg({ registrations: [baseRegistration()] })
    const record = reprocessorReceivedRecord({
      versions: [{ summaryLog: { id: 'sl-missing' } }]
    })
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi.fn().mockResolvedValue([record])
      },
      summaryLogsRepository: {
        findAllByOrgReg: vi.fn().mockResolvedValue([])
      }
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(2)
    // The Submitted At column (index 6) should be an empty quoted cell
    const cells = out[1].trim().split(',')
    expect(cells[6]).toBe('""')
  })

  it('processes received, processed, sentOn and exported records on the same registration', async () => {
    const org = baseOrg({ registrations: [baseRegistration()] })
    const received = reprocessorReceivedRecord({ rowId: '1001' })
    const processed = {
      type: WASTE_RECORD_TYPE.PROCESSED,
      rowId: '2001',
      data: { processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT },
      versions: [{ summaryLog: { id: 'sl-1' } }]
    }
    const sentOn = {
      type: WASTE_RECORD_TYPE.SENT_ON,
      rowId: '3001',
      data: {
        processingType: PROCESSING_TYPES.EXPORTER,
        FINAL_DESTINATION_NAME: 'Other Co'
      },
      versions: [{ summaryLog: { id: 'sl-1' } }]
    }
    const exported = {
      type: WASTE_RECORD_TYPE.EXPORTED,
      rowId: '4001',
      data: {
        processingType: PROCESSING_TYPES.EXPORTER,
        DATE_OF_EXPORT: '2026-03-01'
      },
      versions: [{ summaryLog: { id: 'sl-1' } }]
    }
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi
          .fn()
          .mockResolvedValue([received, processed, sentOn, exported])
      }
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(5) // header + 4 records
    // After sort by (type, rowId): exported < processed < received < sentOn (alphabetical)
    expect(out[1]).toContain('exported')
    expect(out[2]).toContain('processed')
    expect(out[3]).toContain('received')
    expect(out[4]).toContain('sentOn')
    expect(out[4]).toContain('Other Co')
  })

  it('builds the ORS context once per registration from the pre-loaded sites map', async () => {
    const validFrom = new Date('2026-01-01')
    const org = baseOrg({
      registrations: [
        baseRegistration({
          overseasSites: {
            '001': { overseasSiteId: 'site-a' }
          }
        })
      ]
    })
    // An EXPORTED record with all required fields and OSR_ID '001'.
    // With validFrom matching the export date, classifyForWasteBalance should INCLUDE it.
    const exportedRecord = {
      type: WASTE_RECORD_TYPE.EXPORTED,
      rowId: '4001',
      data: {
        processingType: PROCESSING_TYPES.EXPORTER,
        ROW_ID: '4001',
        DATE_RECEIVED_FOR_EXPORT: '2026-02-01',
        EWC_CODE: '15 01 02',
        DESCRIPTION_WASTE: 'Plastic packaging',
        WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
        GROSS_WEIGHT: 10,
        TARE_WEIGHT: 1,
        PALLET_WEIGHT: 0,
        NET_WEIGHT: 9,
        BAILING_WIRE_PROTOCOL: 'No',
        HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Sampling',
        WEIGHT_OF_NON_TARGET_MATERIALS: 0,
        RECYCLABLE_PROPORTION_PERCENTAGE: 100,
        TONNAGE_RECEIVED_FOR_EXPORT: 9,
        TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 9,
        DATE_OF_EXPORT: '2026-03-01',
        BASEL_EXPORT_CODE: 'B3010',
        CUSTOMS_CODES: '391510',
        CONTAINER_NUMBER: 'CN-001',
        DATE_RECEIVED_BY_OSR: '2026-04-01',
        OSR_ID: '001',
        DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No'
      },
      versions: [{ summaryLog: { id: 'sl-1' } }]
    }
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi.fn().mockResolvedValue([exportedRecord])
      },
      overseasSitesRepository: {
        findAll: vi.fn().mockResolvedValue([{ id: 'site-a', validFrom }])
      }
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(2)
    expect(deps.overseasSitesRepository.findAll).toHaveBeenCalledTimes(1)
    // "Included in Waste Balance" is the 8th metadata column (index 7) → "true"
    const cells = out[1].trim().split(',')
    expect(cells[7]).toBe('"true"')
  })

  it('iterates organisations and registrations sorted by id for deterministic output', async () => {
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
    const callOrder = []
    const deps = baseDeps({
      organisationsRepository: {
        findAll: vi.fn().mockResolvedValue([orgB, orgA])
      },
      wasteRecordsRepository: {
        findByRegistration: vi.fn(async (orgId, regId) => {
          callOrder.push(`${orgId}/${regId}`)
          return []
        })
      }
    })

    await collect(streamCsvExport(deps))
    expect(callOrder).toEqual(['org-a/reg-x', 'org-b/reg-1', 'org-b/reg-2'])
  })

  it('emits records sorted by (type, rowId) for determinism', async () => {
    const org = baseOrg({ registrations: [baseRegistration()] })
    const recordHigh = reprocessorReceivedRecord({ rowId: '2002' })
    const recordLow = reprocessorReceivedRecord({ rowId: '1001' })
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi.fn().mockResolvedValue([recordHigh, recordLow])
      }
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(3)
    // Within the same type, lower rowId emits first
    expect(out[1]).toContain('"1001"')
    expect(out[2]).toContain('"2002"')
  })

  it('treats a missing accreditation as registered-only', async () => {
    const org = baseOrg({
      registrations: [baseRegistration({ accreditation: undefined })]
    })
    const record = reprocessorReceivedRecord()
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi.fn().mockResolvedValue([record])
      }
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(2)
    const cells = out[1].trim().split(',')
    expect(cells[4]).toBe('"No"') // Accredited column
  })

  it('skips organisations that have no registrations array', async () => {
    const org = baseOrg({ registrations: undefined })
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) }
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(1) // header only
  })

  it('propagates errors from the waste records iterator', async () => {
    const org = baseOrg({ registrations: [baseRegistration()] })
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi.fn().mockRejectedValue(new Error('cursor died'))
      }
    })

    await expect(collect(streamCsvExport(deps))).rejects.toThrow('cursor died')
  })
})

describe('streamCsvExportToReadable', () => {
  it('returns a Readable stream that emits the same lines as the generator', async () => {
    const readable = streamCsvExportToReadable(baseDeps())
    const chunks = []
    for await (const chunk of readable) {
      chunks.push(chunk.toString('utf8'))
    }
    expect(chunks).toHaveLength(1)
    for (const column of buildHeaderRow(buildDataFieldColumns([]))) {
      expect(chunks[0]).toContain(column)
    }
  })

  it('includes runtime-observed data keys in the header even when not in any schema constant', async () => {
    const org = baseOrg({ registrations: [baseRegistration()] })
    const record = reprocessorReceivedRecord({
      data: {
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
        DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
        BILL_OF_LANDING_REFERENCE_NUMBER: 'BL-99'
      }
    })
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi.fn().mockResolvedValue([record]),
        findDistinctDataKeys: vi
          .fn()
          .mockResolvedValue([
            'processingType',
            'DATE_RECEIVED_FOR_REPROCESSING',
            'BILL_OF_LANDING_REFERENCE_NUMBER'
          ])
      }
    })
    const out = await collect(streamCsvExport(deps))
    expect(out[0]).toContain('BILL_OF_LANDING_REFERENCE_NUMBER')
    expect(out[1]).toContain('BL-99')
  })

  it('uses findDistinctDataKeys to compose the header without buffering any record document', async () => {
    const org = baseOrg({ registrations: [baseRegistration()] })
    const record = reprocessorReceivedRecord()
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi.fn().mockResolvedValue([record]),
        findDistinctDataKeys: vi.fn().mockResolvedValue(['WASTE_TRANSFER_NOTE'])
      }
    })

    const out = await collect(streamCsvExport(deps))

    expect(
      deps.wasteRecordsRepository.findDistinctDataKeys
    ).toHaveBeenCalledTimes(1)
    expect(out[0]).toContain('WASTE_TRANSFER_NOTE')
  })
})

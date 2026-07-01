import {
  streamCsvExport,
  streamCsvExportToReadable
} from './stream-csv-export.js'
import {
  METADATA_COLUMNS,
  OSR_COUNTRY_REVISED,
  OSR_NAME_REVISED,
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
  accreditations: [],
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
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(baseOrg())
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

  it('emits registration and accreditation numbers and the detailed glass material', async () => {
    const accreditation = {
      id: 'acc-1',
      status: 'approved',
      accreditationNumber: 'ACC-777',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      statusHistory: []
    }
    const org = baseOrg({
      accreditations: [accreditation],
      registrations: [
        baseRegistration({
          accreditation: null,
          accreditationId: 'acc-1',
          registrationNumber: 'REG-555',
          material: 'glass',
          glassRecyclingProcess: ['glass_re_melt']
        })
      ]
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
    expect(cells[2]).toBe('REG-555') // Registration Number
    expect(cells[3]).toBe('glass_re_melt') // Material (detailed)
    expect(cells[5]).toBe('Yes') // Accredited
    expect(cells[6]).toBe('ACC-777') // Accreditation Number
  })

  it('serialises a numeric data field bare so it is a real number in the CSV', async () => {
    const org = baseOrg({ registrations: [baseRegistration()] })
    const record = reprocessorReceivedRecord({
      data: {
        processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
        GROSS_WEIGHT: 10
      }
    })
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi.fn().mockResolvedValue([record])
      }
    })

    const out = await collect(streamCsvExport(deps))
    const idx = buildHeaderRow(buildDataFieldColumns([])).indexOf(
      'GROSS_WEIGHT'
    )
    const cells = out[1].trim().split(',')
    expect(cells[idx]).toBe('10') // bare, not the quoted '"10"'
  })

  it('apostrophe-prefixes a dangerous free-text value end to end', async () => {
    const org = baseOrg({
      companyDetails: { name: '=cmd|calc' },
      registrations: [baseRegistration()]
    })
    const record = reprocessorReceivedRecord()
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi.fn().mockResolvedValue([record])
      }
    })

    const out = await collect(streamCsvExport(deps))
    // The apostrophe prefix is the real defence; fast-csv additionally wraps a
    // leading-"=" cell in quotes, so assert the sanitised text is present
    // rather than coupling to that quoting.
    expect(out[1]).toContain("'=cmd|calc")
    expect(out[1]).not.toContain('"=cmd|calc"')
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
    // The Submitted At column (index 8) is empty and serialises bare
    const cells = out[1].trim().split(',')
    expect(cells[8]).toBe('')
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
    // "Included in Waste Balance" is the 10th metadata column (index 9) → true
    const cells = out[1].trim().split(',')
    expect(cells[9]).toBe('true')
  })

  it('populates the derived OSR columns from the approved overseas site matched by OSR_ID', async () => {
    const org = baseOrg({
      registrations: [
        baseRegistration({
          overseasSites: { '001': { overseasSiteId: 'site-a' } }
        })
      ]
    })
    const exportedRecord = {
      type: WASTE_RECORD_TYPE.EXPORTED,
      rowId: '4001',
      data: {
        processingType: PROCESSING_TYPES.EXPORTER,
        OSR_ID: '001',
        DATE_OF_EXPORT: '2026-03-01'
      },
      versions: [{ summaryLog: { id: 'sl-1' } }]
    }
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi.fn().mockResolvedValue([exportedRecord])
      },
      overseasSitesRepository: {
        findAll: vi.fn().mockResolvedValue([
          {
            id: 'site-a',
            validFrom: new Date('2026-01-01'),
            name: 'Acme Recycling',
            country: 'Germany'
          }
        ])
      }
    })

    const out = await collect(streamCsvExport(deps))
    const header = buildHeaderRow(buildDataFieldColumns([]))
    const cells = out[1].trim().split(',')
    expect(cells[header.indexOf(OSR_COUNTRY_REVISED)]).toBe('Germany')
    expect(cells[header.indexOf(OSR_NAME_REVISED)]).toBe('Acme Recycling')
  })

  it('leaves the derived OSR columns blank for a reprocessor row with no OSR_ID', async () => {
    const org = baseOrg({ registrations: [baseRegistration()] })
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi
          .fn()
          .mockResolvedValue([reprocessorReceivedRecord()])
      }
    })

    const out = await collect(streamCsvExport(deps))
    const header = buildHeaderRow(buildDataFieldColumns([]))
    const cells = out[1].trim().split(',')
    expect(cells[header.indexOf(OSR_COUNTRY_REVISED)]).toBe('')
    expect(cells[header.indexOf(OSR_NAME_REVISED)]).toBe('')
  })

  const exporterAccreditation = {
    id: 'acc-1',
    status: 'approved',
    validFrom: '2026-01-01',
    validTo: '2026-12-31',
    statusHistory: []
  }

  const exportedRecordForAccreditationTests = (dateOfExport) => ({
    type: WASTE_RECORD_TYPE.EXPORTED,
    rowId: '5001',
    data: {
      processingType: PROCESSING_TYPES.EXPORTER,
      ROW_ID: '5001',
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
      DATE_OF_EXPORT: dateOfExport,
      BASEL_EXPORT_CODE: 'B3010',
      CUSTOMS_CODES: '391510',
      CONTAINER_NUMBER: 'CN-001',
      DATE_RECEIVED_BY_OSR: '2026-04-01',
      OSR_ID: '001',
      DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No'
    },
    versions: [{ summaryLog: { id: 'sl-1' } }]
  })

  it('marks accredited exporter row as included when DATE_OF_EXPORT is within accreditation period', async () => {
    const org = baseOrg({
      accreditations: [exporterAccreditation],
      registrations: [
        baseRegistration({
          accreditation: null,
          accreditationId: 'acc-1',
          overseasSites: { '001': { overseasSiteId: 'site-a' } }
        })
      ]
    })
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi
          .fn()
          .mockResolvedValue([
            exportedRecordForAccreditationTests('2026-03-01')
          ])
      },
      overseasSitesRepository: {
        findAll: vi
          .fn()
          .mockResolvedValue([
            { id: 'site-a', validFrom: new Date('2026-01-01') }
          ])
      }
    })

    const out = await collect(streamCsvExport(deps))
    const cells = out[1].trim().split(',')
    expect(cells[5]).toBe('Yes') // Accredited column
    expect(cells[9]).toBe('true')
  })

  it('marks accredited exporter row as not included when DATE_OF_EXPORT is outside accreditation period', async () => {
    const org = baseOrg({
      accreditations: [exporterAccreditation],
      registrations: [
        baseRegistration({
          accreditation: null,
          accreditationId: 'acc-1',
          overseasSites: { '001': { overseasSiteId: 'site-a' } }
        })
      ]
    })
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi
          .fn()
          .mockResolvedValue([
            exportedRecordForAccreditationTests('2025-06-01')
          ])
      },
      overseasSitesRepository: {
        findAll: vi
          .fn()
          .mockResolvedValue([
            { id: 'site-a', validFrom: new Date('2026-01-01') }
          ])
      }
    })

    const out = await collect(streamCsvExport(deps))
    const cells = out[1].trim().split(',')
    expect(cells[5]).toBe('Yes') // Accredited column
    expect(cells[9]).toBe('false')
    expect(cells[10]).toContain('OUTSIDE_ACCREDITATION_PERIOD')
    expect(cells[11]).toBe('') // Waste Balance Tonnage empty when excluded
  })

  it('emits empty Waste Balance Exclusion Reason when the record is included', async () => {
    const org = baseOrg({
      accreditations: [exporterAccreditation],
      registrations: [
        baseRegistration({
          accreditation: null,
          accreditationId: 'acc-1',
          overseasSites: { '001': { overseasSiteId: 'site-a' } }
        })
      ]
    })
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi
          .fn()
          .mockResolvedValue([
            exportedRecordForAccreditationTests('2026-03-01')
          ])
      },
      overseasSitesRepository: {
        findAll: vi
          .fn()
          .mockResolvedValue([
            { id: 'site-a', validFrom: new Date('2026-01-01') }
          ])
      }
    })

    const out = await collect(streamCsvExport(deps))
    const cells = out[1].trim().split(',')
    expect(cells[9]).toBe('true')
    expect(cells[10]).toBe('') // Waste Balance Exclusion Reason empty when included
    expect(Number(cells[11])).toBeGreaterThan(0) // Waste Balance Tonnage populated when included
  })

  it('reads Accredited "Yes" with the number for a suspended accreditation', async () => {
    const suspendedAccreditation = {
      id: 'acc-1',
      status: 'suspended',
      accreditationNumber: 'ACC-SUS-1',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      statusHistory: []
    }
    const org = baseOrg({
      accreditations: [suspendedAccreditation],
      registrations: [
        baseRegistration({ accreditation: null, accreditationId: 'acc-1' })
      ]
    })
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi
          .fn()
          .mockResolvedValue([reprocessorReceivedRecord()])
      }
    })

    const out = await collect(streamCsvExport(deps))
    const cells = out[1].trim().split(',')
    expect(cells[5]).toBe('Yes') // Accredited
    expect(cells[6]).toBe('ACC-SUS-1') // Accreditation Number
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
    // Within the same type, lower rowId emits first (Row ID is metadata col 12)
    expect(out[1].trim().split(',')[12]).toBe('1001')
    expect(out[2].trim().split(',')[12]).toBe('2002')
  })

  it('orders rowIds naturally so "9" comes before "10"', async () => {
    const org = baseOrg({ registrations: [baseRegistration()] })
    const recordTen = reprocessorReceivedRecord({ rowId: '10' })
    const recordNine = reprocessorReceivedRecord({ rowId: '9' })
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) },
      wasteRecordsRepository: {
        findByRegistration: vi.fn().mockResolvedValue([recordTen, recordNine])
      }
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(3)
    expect(out[1].trim().split(',')[12]).toBe('9')
    expect(out[2].trim().split(',')[12]).toBe('10')
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
    expect(cells[5]).toBe('No') // Accredited column
  })

  it('skips organisations that have no registrations array', async () => {
    const org = baseOrg({ registrations: undefined })
    const deps = baseDeps({
      organisationsRepository: { findAll: vi.fn().mockResolvedValue([org]) }
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(1) // header only
  })

  it('excludes organisations configured as test organisations', async () => {
    // 999999 is set as a test organisation via process.env.TEST_ORGANISATIONS
    // in .vite/setup-files.js, matching the prod pattern of gating test orgs
    // out of admin-visible data.
    const testOrg = baseOrg({
      id: 'org-test',
      orgId: 999999,
      companyDetails: { name: 'Test Org' },
      registrations: [baseRegistration({ id: 'reg-test' })]
    })
    const realOrg = baseOrg({
      id: 'org-real',
      orgId: 123456,
      companyDetails: { name: 'Real Org' },
      registrations: [baseRegistration({ id: 'reg-real' })]
    })
    const findByRegistration = vi
      .fn()
      .mockResolvedValue([reprocessorReceivedRecord()])
    const deps = baseDeps({
      organisationsRepository: {
        findAll: vi.fn().mockResolvedValue([testOrg, realOrg])
      },
      wasteRecordsRepository: { findByRegistration }
    })

    const out = await collect(streamCsvExport(deps))

    expect(out).toHaveLength(2) // header + one row for the real org only
    expect(out[1]).toContain('Real Org')
    expect(out[1]).not.toContain('Test Org')
    expect(findByRegistration).toHaveBeenCalledTimes(1)
    expect(findByRegistration).toHaveBeenCalledWith('org-real', 'reg-real')
  })

  it('fetches a single organisation by id and skips findAll when scoped by organisationId', async () => {
    const org = baseOrg({
      id: 'org-scoped',
      companyDetails: { name: 'Scoped Org' },
      registrations: [baseRegistration()]
    })
    const deps = baseDeps({
      organisationsRepository: {
        findById: vi.fn().mockResolvedValue(org),
        findAll: vi.fn().mockResolvedValue([])
      },
      wasteRecordsRepository: {
        findByRegistration: vi
          .fn()
          .mockResolvedValue([reprocessorReceivedRecord()])
      }
    })

    const out = await collect(
      streamCsvExport({ ...deps, organisationId: 'org-scoped' })
    )

    expect(deps.organisationsRepository.findById).toHaveBeenCalledWith(
      'org-scoped'
    )
    expect(deps.organisationsRepository.findAll).not.toHaveBeenCalled()
    expect(out).toHaveLength(2)
    expect(out[1]).toContain('Scoped Org')
  })

  it('exports only the requested registration when scoped by registrationId', async () => {
    const org = baseOrg({
      id: 'org-scoped',
      registrations: [
        baseRegistration({ id: 'reg-1' }),
        baseRegistration({ id: 'reg-2' })
      ]
    })
    const findByRegistration = vi
      .fn()
      .mockResolvedValue([reprocessorReceivedRecord()])
    const deps = baseDeps({
      organisationsRepository: { findById: vi.fn().mockResolvedValue(org) },
      wasteRecordsRepository: { findByRegistration }
    })

    const out = await collect(
      streamCsvExport({
        ...deps,
        organisationId: 'org-scoped',
        registrationId: 'reg-2'
      })
    )

    expect(out).toHaveLength(2) // header + one record for reg-2 only
    expect(findByRegistration).toHaveBeenCalledTimes(1)
    expect(findByRegistration).toHaveBeenCalledWith('org-scoped', 'reg-2')
  })

  it('includes a test organisation when it is explicitly requested by id', async () => {
    const testOrg = baseOrg({
      id: 'org-test',
      orgId: 999999,
      companyDetails: { name: 'Test Org' },
      registrations: [baseRegistration({ id: 'reg-test' })]
    })
    const deps = baseDeps({
      organisationsRepository: { findById: vi.fn().mockResolvedValue(testOrg) },
      wasteRecordsRepository: {
        findByRegistration: vi
          .fn()
          .mockResolvedValue([reprocessorReceivedRecord()])
      }
    })

    const out = await collect(
      streamCsvExport({ ...deps, organisationId: 'org-test' })
    )

    expect(out).toHaveLength(2)
    expect(out[1]).toContain('Test Org')
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

import {
  streamCsvExport,
  streamCsvExportToReadable
} from './stream-csv-export.js'
import {
  METADATA_COLUMNS,
  METADATA_COL_INDEX,
  OSR_COUNTRY_REVISED,
  OSR_NAME_REVISED,
  buildDataFieldColumns,
  buildHeaderRow
} from '../domain/csv-columns.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'

/** @import { LedgerEvent } from '#waste-balances/repository/ledger-schema.js' */
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'

const collect = async (gen) => {
  const out = []
  for await (const row of gen) {
    out.push(row)
  }
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

const naClassification = () => ({
  outcome: WASTE_BALANCE_OUTCOME.NOT_APPLICABLE,
  reasons: [],
  transactionAmount: 0
})

// A committed row-state entry (upsert shape). Defaults to a reprocessor
// received row whose data cannot classify — the export re-derives inclusion
// from the row's data and the current context, so a row that should classify
// carries `completeReceivedData` instead.
const receivedRowState = (overrides = {}) => ({
  rowId: '1001',
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  data: { DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01' },
  classification: naClassification(),
  ...overrides
})

// Every field the reprocessor-input received schema needs to reach a per-row
// waste-balance outcome, so the only thing left deciding the outcome is the
// accreditation the export resolves at read time.
const completeReceivedData = (overrides = {}) => ({
  DATE_RECEIVED_FOR_REPROCESSING: '2026-06-15',
  EWC_CODE: '03 03 08',
  DESCRIPTION_WASTE: 'Paper - other',
  WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
  GROSS_WEIGHT: 100,
  TARE_WEIGHT: 5,
  PALLET_WEIGHT: 5,
  NET_WEIGHT: 90,
  BAILING_WIRE_PROTOCOL: 'No',
  HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'AAIG percentage',
  WEIGHT_OF_NON_TARGET_MATERIALS: 10,
  RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
  TONNAGE_RECEIVED_FOR_RECYCLING: 50.5,
  ...overrides
})

// The exporter equivalent of `completeReceivedData` — everything the
// received-loads-for-export schema needs before the overseas site's approval
// date is what decides the outcome.
const completeExportedData = (overrides = {}) => ({
  DATE_RECEIVED_FOR_EXPORT: '2026-06-01',
  EWC_CODE: '03 03 08',
  DESCRIPTION_WASTE: 'Paper - other',
  WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
  GROSS_WEIGHT: 100,
  TARE_WEIGHT: 5,
  PALLET_WEIGHT: 5,
  NET_WEIGHT: 90,
  BAILING_WIRE_PROTOCOL: 'No',
  HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'AAIG percentage',
  WEIGHT_OF_NON_TARGET_MATERIALS: 10,
  RECYCLABLE_PROPORTION_PERCENTAGE: 0.8,
  TONNAGE_RECEIVED_FOR_EXPORT: 72,
  TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 60.5,
  DATE_OF_EXPORT: '2026-06-15',
  BASEL_EXPORT_CODE: 'B1010',
  CUSTOMS_CODES: 'HS123',
  CONTAINER_NUMBER: 'CONT001',
  DATE_RECEIVED_BY_OSR: '2026-06-20',
  OSR_ID: '001',
  DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE: 'No',
  ...overrides
})

const approvedAccreditation = (overrides = {}) => ({
  id: 'acc-1',
  status: 'approved',
  accreditationNumber: 'ACC-777',
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
  statusHistory: [],
  ...overrides
})

const DEFAULT_SUMMARY_LOG_ID = 'sl-1'

/**
 * Build export deps backed by the real in-memory ledger and row-state
 * adapters. `seeds` lists each registration's submitted summary log and its
 * committed rows; the ledger records one submitted event per seed so the
 * export resolves that summary log as the registration's latest.
 *
 * @param {{
 *   orgs?: any[],
 *   seeds?: any[],
 *   summaryLogs?: Record<string, any[]>,
 *   sites?: any[],
 *   organisationId?: string,
 *   registrationId?: string
 * }} [options]
 */
const buildDeps = async ({
  orgs = [],
  seeds = [],
  summaryLogs = {},
  sites = [],
  organisationId,
  registrationId
} = {}) => {
  const ledgerEvents = seeds.map((seed) =>
    buildLedgerEvent({
      organisationId: seed.organisationId ?? 'org-1',
      registrationId: seed.registrationId ?? 'reg-1',
      accreditationId: seed.accreditationId ?? null,
      number: 1,
      payload: {
        summaryLogId: seed.summaryLogId ?? DEFAULT_SUMMARY_LOG_ID,
        creditTotal: 0
      }
    })
  )
  const ledgerRepository = createInMemoryLedgerRepository(
    /** @type {LedgerEvent[]} */ (ledgerEvents)
  )()

  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStateRepository()()
  for (const seed of seeds) {
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      {
        organisationId: seed.organisationId ?? 'org-1',
        registrationId: seed.registrationId ?? 'reg-1',
        accreditationId: seed.accreditationId ?? null
      },
      seed.rows ?? [],
      seed.summaryLogId ?? DEFAULT_SUMMARY_LOG_ID
    )
  }

  return {
    organisationsRepository: {
      findAll: async () => orgs,
      findById: async (id) => orgs.find((org) => org.id === id)
    },
    summaryLogRowStatesRepository,
    ledgerRepository,
    summaryLogsRepository: {
      findAllByOrgReg: async (org, reg) => summaryLogs[`${org}/${reg}`] ?? []
    },
    overseasSitesRepository: {
      findAll: async () => sites
    },
    organisationId,
    registrationId
  }
}

describe('streamCsvExport', () => {
  it('emits the header row even when no organisations exist', async () => {
    const out = await collect(streamCsvExport(await buildDeps()))
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

  it('emits one data row per row state with org/registration/row/summaryLog data populated', async () => {
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      seeds: [{ rows: [receivedRowState()] }],
      summaryLogs: {
        'org-1/reg-1': [
          {
            id: DEFAULT_SUMMARY_LOG_ID,
            summaryLog: { submittedAt: '2026-04-15T09:00:00Z' }
          }
        ]
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
    const deps = await buildDeps({
      orgs: [org],
      seeds: [{ accreditationId: 'acc-1', rows: [receivedRowState()] }]
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(2)
    const cells = out[1].trim().split(',')
    expect(cells[METADATA_COL_INDEX['Registration Number']]).toBe('REG-555')
    expect(cells[METADATA_COL_INDEX['Material']]).toBe('glass_re_melt')
    expect(cells[METADATA_COL_INDEX['Accredited']]).toBe('Yes')
    expect(cells[METADATA_COL_INDEX['Accreditation Number']]).toBe('ACC-777')
  })

  it('serialises a numeric data field bare so it is a real number in the CSV', async () => {
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      seeds: [
        {
          rows: [
            receivedRowState({
              data: {
                DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
                GROSS_WEIGHT: 10
              }
            })
          ]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    const idx = buildHeaderRow(buildDataFieldColumns([])).indexOf(
      'GROSS_WEIGHT'
    )
    const cells = out[1].trim().split(',')
    expect(cells[idx]).toBe('10') // bare, not the quoted '"10"'
  })

  it('apostrophe-prefixes a dangerous free-text value end to end', async () => {
    const deps = await buildDeps({
      orgs: [
        baseOrg({
          companyDetails: { name: '=cmd|calc' },
          registrations: [baseRegistration()]
        })
      ],
      seeds: [{ rows: [receivedRowState()] }]
    })

    const out = await collect(streamCsvExport(deps))
    // The apostrophe prefix is the real defence; fast-csv additionally wraps a
    // leading-"=" cell in quotes, so assert the sanitised text is present
    // rather than coupling to that quoting.
    expect(out[1]).toContain("'=cmd|calc")
    expect(out[1]).not.toContain('"=cmd|calc"')
  })

  it('emits empty Submitted At when no summary log matches the latest submitted id', async () => {
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      seeds: [{ rows: [receivedRowState()] }],
      summaryLogs: {}
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(2)
    const cells = out[1].trim().split(',')
    expect(cells[METADATA_COL_INDEX['Submitted At']]).toBe('')
  })

  it('processes received, processed, sentOn and exported rows on the same registration', async () => {
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      seeds: [
        {
          rows: [
            receivedRowState({ rowId: '1001' }),
            {
              rowId: '2001',
              wasteRecordType: WASTE_RECORD_TYPE.PROCESSED,
              processingType: PROCESSING_TYPES.REPROCESSOR_OUTPUT,
              data: {},
              classification: naClassification()
            },
            {
              rowId: '3001',
              wasteRecordType: WASTE_RECORD_TYPE.SENT_ON,
              processingType: PROCESSING_TYPES.EXPORTER,
              data: { FINAL_DESTINATION_NAME: 'Other Co' },
              classification: naClassification()
            },
            {
              rowId: '4001',
              wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
              processingType: PROCESSING_TYPES.EXPORTER,
              data: { DATE_OF_EXPORT: '2026-03-01' },
              classification: naClassification()
            }
          ]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(5) // header + 4 rows
    // After sort by (type, rowId): exported < processed < received < sentOn (alphabetical)
    expect(out[1]).toContain('exported')
    expect(out[2]).toContain('processed')
    expect(out[3]).toContain('received')
    expect(out[4]).toContain('sentOn')
    expect(out[4]).toContain('Other Co')
  })

  it('builds the ORS context once per registration from the pre-loaded sites map', async () => {
    const org = baseOrg({
      accreditations: [approvedAccreditation()],
      registrations: [
        baseRegistration({
          accreditation: null,
          accreditationId: 'acc-1',
          overseasSites: { '001': { overseasSiteId: 'site-a' } }
        })
      ]
    })
    const findAll = vi
      .fn()
      .mockResolvedValue([{ id: 'site-a', validFrom: new Date('2026-01-01') }])
    const deps = await buildDeps({
      orgs: [org],
      seeds: [
        {
          accreditationId: 'acc-1',
          rows: [
            {
              rowId: '4001',
              wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
              processingType: PROCESSING_TYPES.EXPORTER,
              data: completeExportedData(),
              classification: naClassification()
            }
          ]
        }
      ]
    })
    deps.overseasSitesRepository.findAll = findAll

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(2)
    expect(findAll).toHaveBeenCalledTimes(1)
    const cells = out[1].trim().split(',')
    expect(cells[METADATA_COL_INDEX['Included in Waste Balance']]).toBe('true')
  })

  it('excludes an exported row whose overseas site is not yet approved on the export date', async () => {
    const org = baseOrg({
      accreditations: [approvedAccreditation()],
      registrations: [
        baseRegistration({
          accreditation: null,
          accreditationId: 'acc-1',
          overseasSites: { '001': { overseasSiteId: 'site-a' } }
        })
      ]
    })
    const deps = await buildDeps({
      orgs: [org],
      sites: [{ id: 'site-a', validFrom: new Date('2026-09-01') }],
      seeds: [
        {
          accreditationId: 'acc-1',
          rows: [
            {
              rowId: '4001',
              wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
              processingType: PROCESSING_TYPES.EXPORTER,
              data: completeExportedData(),
              classification: {
                outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
                reasons: [],
                transactionAmount: 60.5
              }
            }
          ]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    const cells = out[1].trim().split(',')
    expect(cells[METADATA_COL_INDEX['Included in Waste Balance']]).toBe('false')
    expect(
      cells[METADATA_COL_INDEX['Waste Balance Exclusion Reason']]
    ).toContain('ORS_NOT_APPROVED')
  })

  it('populates the derived OSR columns from the approved overseas site matched by OSR_ID', async () => {
    const org = baseOrg({
      registrations: [
        baseRegistration({
          overseasSites: { '001': { overseasSiteId: 'site-a' } }
        })
      ]
    })
    const deps = await buildDeps({
      orgs: [org],
      seeds: [
        {
          rows: [
            {
              rowId: '4001',
              wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
              processingType: PROCESSING_TYPES.EXPORTER,
              data: { OSR_ID: '001', DATE_OF_EXPORT: '2026-03-01' },
              classification: naClassification()
            }
          ]
        }
      ],
      sites: [
        {
          id: 'site-a',
          validFrom: new Date('2026-01-01'),
          name: 'Acme Recycling',
          country: 'Germany'
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    const header = buildHeaderRow(buildDataFieldColumns([]))
    const cells = out[1].trim().split(',')
    expect(cells[header.indexOf(OSR_COUNTRY_REVISED)]).toBe('Germany')
    expect(cells[header.indexOf(OSR_NAME_REVISED)]).toBe('Acme Recycling')
  })

  it('leaves the derived OSR columns blank for a reprocessor row with no OSR_ID', async () => {
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      seeds: [{ rows: [receivedRowState()] }]
    })

    const out = await collect(streamCsvExport(deps))
    const header = buildHeaderRow(buildDataFieldColumns([]))
    const cells = out[1].trim().split(',')
    expect(cells[header.indexOf(OSR_COUNTRY_REVISED)]).toBe('')
    expect(cells[header.indexOf(OSR_NAME_REVISED)]).toBe('')
  })

  it('includes a row the stamped classification ignored once the accreditation covers its date', async () => {
    const org = baseOrg({
      accreditations: [approvedAccreditation()],
      registrations: [
        baseRegistration({ accreditation: null, accreditationId: 'acc-1' })
      ]
    })
    const deps = await buildDeps({
      orgs: [org],
      seeds: [
        {
          accreditationId: 'acc-1',
          rows: [
            receivedRowState({
              data: completeReceivedData(),
              classification: {
                outcome: WASTE_BALANCE_OUTCOME.IGNORED,
                reasons: [{ code: 'OUTSIDE_ACCREDITATION_PERIOD' }],
                transactionAmount: 0
              }
            })
          ]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    const cells = out[1].trim().split(',')
    expect(cells[METADATA_COL_INDEX['Accredited']]).toBe('Yes')
    expect(cells[METADATA_COL_INDEX['Included in Waste Balance']]).toBe('true')
    expect(cells[METADATA_COL_INDEX['Waste Balance Exclusion Reason']]).toBe('')
    expect(Number(cells[METADATA_COL_INDEX['Waste Balance Tonnage']])).toBe(
      50.5
    )
  })

  it('ignores a row the stamped classification included once the accreditation no longer covers its date', async () => {
    const org = baseOrg({
      accreditations: [
        approvedAccreditation({
          validFrom: '2026-01-01',
          validTo: '2026-03-31'
        })
      ],
      registrations: [
        baseRegistration({ accreditation: null, accreditationId: 'acc-1' })
      ]
    })
    const deps = await buildDeps({
      orgs: [org],
      seeds: [
        {
          accreditationId: 'acc-1',
          rows: [
            receivedRowState({
              data: completeReceivedData(),
              classification: {
                outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
                reasons: [],
                transactionAmount: 50.5
              }
            })
          ]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    const cells = out[1].trim().split(',')
    expect(cells[METADATA_COL_INDEX['Accredited']]).toBe('Yes')
    expect(cells[METADATA_COL_INDEX['Included in Waste Balance']]).toBe('false')
    expect(
      cells[METADATA_COL_INDEX['Waste Balance Exclusion Reason']]
    ).toContain('OUTSIDE_ACCREDITATION_PERIOD')
    expect(cells[METADATA_COL_INDEX['Waste Balance Tonnage']]).toBe('')
  })

  it('gives each row of a summary log its own live outcome', async () => {
    const { TONNAGE_RECEIVED_FOR_RECYCLING: _omitted, ...withoutTonnage } =
      completeReceivedData()
    const org = baseOrg({
      accreditations: [approvedAccreditation()],
      registrations: [
        baseRegistration({ accreditation: null, accreditationId: 'acc-1' })
      ]
    })
    const deps = await buildDeps({
      orgs: [org],
      seeds: [
        {
          accreditationId: 'acc-1',
          rows: [
            receivedRowState({ rowId: '1001', data: completeReceivedData() }),
            receivedRowState({ rowId: '1002', data: withoutTonnage })
          ]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    const included = out[1].trim().split(',')
    const excluded = out[2].trim().split(',')
    expect(included[METADATA_COL_INDEX['Row ID']]).toBe('1001')
    expect(included[METADATA_COL_INDEX['Included in Waste Balance']]).toBe(
      'true'
    )
    expect(Number(included[METADATA_COL_INDEX['Waste Balance Tonnage']])).toBe(
      50.5
    )
    expect(excluded[METADATA_COL_INDEX['Row ID']]).toBe('1002')
    expect(excluded[METADATA_COL_INDEX['Included in Waste Balance']]).toBe(
      'false'
    )
    expect(
      excluded[METADATA_COL_INDEX['Waste Balance Exclusion Reason']]
    ).toContain('TONNAGE_RECEIVED_FOR_RECYCLING')
  })

  it('renders a row missing a waste-balance field as false with blank tonnage', async () => {
    const { TONNAGE_RECEIVED_FOR_RECYCLING: _omitted, ...withoutTonnage } =
      completeReceivedData()
    const deps = await buildDeps({
      orgs: [
        baseOrg({
          accreditations: [approvedAccreditation()],
          registrations: [
            baseRegistration({ accreditation: null, accreditationId: 'acc-1' })
          ]
        })
      ],
      seeds: [
        {
          accreditationId: 'acc-1',
          rows: [receivedRowState({ data: withoutTonnage })]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    const cells = out[1].trim().split(',')
    expect(cells[METADATA_COL_INDEX['Included in Waste Balance']]).toBe('false')
    expect(cells[METADATA_COL_INDEX['Waste Balance Tonnage']]).toBe('')
  })

  it('renders an exclusion reason that names a field as "code: field"', async () => {
    const { TONNAGE_RECEIVED_FOR_RECYCLING: _omitted, ...withoutTonnage } =
      completeReceivedData()
    const deps = await buildDeps({
      orgs: [
        baseOrg({
          accreditations: [approvedAccreditation()],
          registrations: [
            baseRegistration({ accreditation: null, accreditationId: 'acc-1' })
          ]
        })
      ],
      seeds: [
        {
          accreditationId: 'acc-1',
          rows: [receivedRowState({ data: withoutTonnage })]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    expect(out[1]).toContain(
      'MISSING_REQUIRED_FIELD: TONNAGE_RECEIVED_FOR_RECYCLING'
    )
  })

  it('renders an included row as true with its tonnage and blank reason', async () => {
    const deps = await buildDeps({
      orgs: [
        baseOrg({
          accreditations: [approvedAccreditation()],
          registrations: [
            baseRegistration({ accreditation: null, accreditationId: 'acc-1' })
          ]
        })
      ],
      seeds: [
        {
          accreditationId: 'acc-1',
          rows: [receivedRowState({ data: completeReceivedData() })]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    const cells = out[1].trim().split(',')
    expect(cells[METADATA_COL_INDEX['Included in Waste Balance']]).toBe('true')
    expect(cells[METADATA_COL_INDEX['Waste Balance Exclusion Reason']]).toBe('')
    expect(Number(cells[METADATA_COL_INDEX['Waste Balance Tonnage']])).toBe(
      50.5
    )
  })

  it('reads Accredited "Yes" with the number for a suspended accreditation', async () => {
    const org = baseOrg({
      accreditations: [
        {
          id: 'acc-1',
          status: 'suspended',
          accreditationNumber: 'ACC-SUS-1',
          validFrom: '2026-01-01',
          validTo: '2026-12-31',
          statusHistory: []
        }
      ],
      registrations: [
        baseRegistration({ accreditation: null, accreditationId: 'acc-1' })
      ]
    })
    const deps = await buildDeps({
      orgs: [org],
      seeds: [{ accreditationId: 'acc-1', rows: [receivedRowState()] }]
    })

    const out = await collect(streamCsvExport(deps))
    const cells = out[1].trim().split(',')
    expect(cells[METADATA_COL_INDEX['Accredited']]).toBe('Yes')
    expect(cells[METADATA_COL_INDEX['Accreditation Number']]).toBe('ACC-SUS-1')
  })

  it('still exports rows submitted under a since-cancelled accreditation, as Accredited "No"', async () => {
    // Row states are keyed by the accreditation id stamped at submission —
    // whatever its status — so a cancellation after submission must not drop
    // the registration's rows from the FOI export.
    const org = baseOrg({
      accreditations: [
        {
          id: 'acc-1',
          status: 'cancelled',
          accreditationNumber: 'ACC-CAN-1',
          validFrom: '2026-01-01',
          validTo: '2026-12-31',
          statusHistory: []
        }
      ],
      registrations: [
        baseRegistration({ accreditation: null, accreditationId: 'acc-1' })
      ]
    })
    const deps = await buildDeps({
      orgs: [org],
      seeds: [{ accreditationId: 'acc-1', rows: [receivedRowState()] }]
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(2) // header + the row survives the cancellation
    const cells = out[1].trim().split(',')
    expect(cells[METADATA_COL_INDEX['Accredited']]).toBe('No')
    expect(cells[METADATA_COL_INDEX['Included in Waste Balance']]).toBe('NA')
  })

  it('exports rows from every ledger partition, not just the current accreditation', async () => {
    // A registration that submitted under acc-old before moving to acc-new
    // holds two independently valid summary logs, one per ledger partition.
    const org = baseOrg({
      accreditations: [
        approvedAccreditation({
          id: 'acc-old',
          accreditationNumber: 'ACC-OLD'
        }),
        approvedAccreditation({ id: 'acc-new', accreditationNumber: 'ACC-NEW' })
      ],
      registrations: [
        baseRegistration({ accreditation: null, accreditationId: 'acc-new' })
      ]
    })
    const deps = await buildDeps({
      orgs: [org],
      seeds: [
        {
          accreditationId: 'acc-old',
          summaryLogId: 'sl-old',
          rows: [receivedRowState({ rowId: '1001' })]
        },
        {
          accreditationId: 'acc-new',
          summaryLogId: 'sl-new',
          rows: [receivedRowState({ rowId: '2002' })]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))

    expect(out).toHaveLength(3)
    const rowIds = out
      .slice(1)
      .map((line) => line.trim().split(',')[METADATA_COL_INDEX['Row ID']])
    expect(rowIds).toContain('1001')
    expect(rowIds).toContain('2002')
  })

  it('renders each partition against its own accreditation, not the current link', async () => {
    const org = baseOrg({
      accreditations: [
        approvedAccreditation({
          id: 'acc-old',
          accreditationNumber: 'ACC-OLD'
        }),
        approvedAccreditation({ id: 'acc-new', accreditationNumber: 'ACC-NEW' })
      ],
      registrations: [
        baseRegistration({ accreditation: null, accreditationId: 'acc-new' })
      ]
    })
    const deps = await buildDeps({
      orgs: [org],
      seeds: [
        {
          accreditationId: 'acc-old',
          summaryLogId: 'sl-old',
          rows: [receivedRowState({ rowId: '1001' })]
        },
        {
          accreditationId: 'acc-new',
          summaryLogId: 'sl-new',
          rows: [receivedRowState({ rowId: '2002' })]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))

    expect(out).toHaveLength(3)
    const byRowId = new Map(
      out.slice(1).map((line) => {
        const cells = line.trim().split(',')
        return [cells[METADATA_COL_INDEX['Row ID']], cells]
      })
    )
    expect(
      byRowId.get('1001')[METADATA_COL_INDEX['Accreditation Number']]
    ).toBe('ACC-OLD')
    expect(
      byRowId.get('2002')[METADATA_COL_INDEX['Accreditation Number']]
    ).toBe('ACC-NEW')
  })

  it('exports a registered-only period alongside an accredited one, as Accredited "No"', async () => {
    const org = baseOrg({
      accreditations: [approvedAccreditation()],
      registrations: [
        baseRegistration({ accreditation: null, accreditationId: 'acc-1' })
      ]
    })
    const deps = await buildDeps({
      orgs: [org],
      seeds: [
        {
          accreditationId: null,
          summaryLogId: 'sl-registered-only',
          rows: [receivedRowState({ rowId: '1001' })]
        },
        {
          accreditationId: 'acc-1',
          summaryLogId: 'sl-accredited',
          rows: [receivedRowState({ rowId: '2002' })]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))

    expect(out).toHaveLength(3)
    const byRowId = new Map(
      out.slice(1).map((line) => {
        const cells = line.trim().split(',')
        return [cells[METADATA_COL_INDEX['Row ID']], cells]
      })
    )
    expect(byRowId.get('1001')[METADATA_COL_INDEX['Accredited']]).toBe('No')
    expect(
      byRowId.get('1001')[METADATA_COL_INDEX['Accreditation Number']]
    ).toBe('')
    expect(byRowId.get('2002')[METADATA_COL_INDEX['Accredited']]).toBe('Yes')
    expect(
      byRowId.get('2002')[METADATA_COL_INDEX['Accreditation Number']]
    ).toBe('ACC-777')
  })

  it("orders a registration's partitions registered-only first, then by accreditation id", async () => {
    const org = baseOrg({
      accreditations: [
        approvedAccreditation({ id: 'acc-a' }),
        approvedAccreditation({ id: 'acc-b' })
      ],
      registrations: [
        baseRegistration({ accreditation: null, accreditationId: 'acc-b' })
      ]
    })
    const deps = await buildDeps({
      orgs: [org],
      seeds: [
        {
          accreditationId: 'acc-b',
          summaryLogId: 'sl-b',
          rows: [receivedRowState({ rowId: '3003' })]
        },
        {
          accreditationId: null,
          summaryLogId: 'sl-null',
          rows: [receivedRowState({ rowId: '1001' })]
        },
        {
          accreditationId: 'acc-a',
          summaryLogId: 'sl-a',
          rows: [receivedRowState({ rowId: '2002' })]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))

    expect(out).toHaveLength(4)
    const rowIds = out
      .slice(1)
      .map((line) => line.trim().split(',')[METADATA_COL_INDEX['Row ID']])
    expect(rowIds).toEqual(['1001', '2002', '3003'])
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
    const deps = await buildDeps({
      orgs: [orgB, orgA],
      seeds: [
        {
          organisationId: 'org-a',
          registrationId: 'reg-x',
          summaryLogId: 'sl-ax',
          rows: [receivedRowState()]
        },
        {
          organisationId: 'org-b',
          registrationId: 'reg-1',
          summaryLogId: 'sl-b1',
          rows: [receivedRowState()]
        },
        {
          organisationId: 'org-b',
          registrationId: 'reg-2',
          summaryLogId: 'sl-b2',
          rows: [receivedRowState()]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    // header + one row each, ordered org-a/reg-x, org-b/reg-1, org-b/reg-2
    expect(out).toHaveLength(4)
    expect(out[1]).toContain('Alpha')
    expect(out[2]).toContain('Beta')
    expect(out[3]).toContain('Beta')
  })

  it('emits rows sorted by (type, rowId) for determinism', async () => {
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      seeds: [
        {
          rows: [
            receivedRowState({ rowId: '2002' }),
            receivedRowState({ rowId: '1001' })
          ]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(3)
    expect(out[1].trim().split(',')[METADATA_COL_INDEX['Row ID']]).toBe('1001')
    expect(out[2].trim().split(',')[METADATA_COL_INDEX['Row ID']]).toBe('2002')
  })

  it('orders rowIds naturally so "9" comes before "10"', async () => {
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      seeds: [
        {
          rows: [
            receivedRowState({ rowId: '10' }),
            receivedRowState({ rowId: '9' })
          ]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(3)
    expect(out[1].trim().split(',')[METADATA_COL_INDEX['Row ID']]).toBe('9')
    expect(out[2].trim().split(',')[METADATA_COL_INDEX['Row ID']]).toBe('10')
  })

  it('renders a row with no active accreditation as NA with blank reason and tonnage', async () => {
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      seeds: [{ rows: [receivedRowState()] }]
    })

    const out = await collect(streamCsvExport(deps))
    const cells = out[1].trim().split(',')
    expect(cells[METADATA_COL_INDEX['Included in Waste Balance']]).toBe('NA')
    expect(cells[METADATA_COL_INDEX['Waste Balance Exclusion Reason']]).toBe('')
    expect(cells[METADATA_COL_INDEX['Waste Balance Tonnage']]).toBe('')
  })

  it('contributes no rows for a submitted summary log that committed none', async () => {
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      seeds: [{ rows: [] }]
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(1) // header only
  })

  it('contributes no rows for a registration with no submitted summary log', async () => {
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      seeds: []
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(1) // header only
  })

  it('skips organisations that have no registrations array', async () => {
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: undefined })]
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
    const deps = await buildDeps({
      orgs: [testOrg, realOrg],
      seeds: [
        {
          organisationId: 'org-test',
          registrationId: 'reg-test',
          summaryLogId: 'sl-test',
          rows: [receivedRowState()]
        },
        {
          organisationId: 'org-real',
          registrationId: 'reg-real',
          summaryLogId: 'sl-real',
          rows: [receivedRowState()]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))

    expect(out).toHaveLength(2) // header + one row for the real org only
    expect(out[1]).toContain('Real Org')
    expect(out[1]).not.toContain('Test Org')
  })

  it('fetches a single organisation by id and skips findAll when scoped by organisationId', async () => {
    const org = baseOrg({
      id: 'org-scoped',
      companyDetails: { name: 'Scoped Org' },
      registrations: [baseRegistration()]
    })
    const deps = await buildDeps({
      orgs: [org],
      seeds: [{ organisationId: 'org-scoped', rows: [receivedRowState()] }],
      organisationId: 'org-scoped'
    })
    const findAll = vi.fn().mockResolvedValue([])
    deps.organisationsRepository.findAll = findAll

    const out = await collect(streamCsvExport(deps))

    expect(findAll).not.toHaveBeenCalled()
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
    const deps = await buildDeps({
      orgs: [org],
      seeds: [
        {
          organisationId: 'org-scoped',
          registrationId: 'reg-1',
          summaryLogId: 'sl-1',
          rows: [receivedRowState()]
        },
        {
          organisationId: 'org-scoped',
          registrationId: 'reg-2',
          summaryLogId: 'sl-2',
          rows: [receivedRowState({ rowId: '2001' })]
        }
      ],
      organisationId: 'org-scoped',
      registrationId: 'reg-2'
    })

    const out = await collect(streamCsvExport(deps))

    expect(out).toHaveLength(2) // header + one row for reg-2 only
    expect(out[1].trim().split(',')[METADATA_COL_INDEX['Row ID']]).toBe('2001')
  })

  it('includes a test organisation when it is explicitly requested by id', async () => {
    const testOrg = baseOrg({
      id: 'org-test',
      orgId: 999999,
      companyDetails: { name: 'Test Org' },
      registrations: [baseRegistration({ id: 'reg-test' })]
    })
    const deps = await buildDeps({
      orgs: [testOrg],
      seeds: [
        {
          organisationId: 'org-test',
          registrationId: 'reg-test',
          rows: [receivedRowState()]
        }
      ],
      organisationId: 'org-test'
    })

    const out = await collect(streamCsvExport(deps))

    expect(out).toHaveLength(2)
    expect(out[1]).toContain('Test Org')
  })

  it('coerces a mixed-typed column to a single type so the PAE-1560 discrepancy does not reproduce', async () => {
    // A tonnage submitted as a numeric-string is stored verbatim; the export
    // coerces it against the schema on read, so the exported cell is a bare
    // number matching a row that submitted the same value as a number.
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      seeds: [
        {
          rows: [
            receivedRowState({
              rowId: '1001',
              data: {
                DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
                TONNAGE_RECEIVED_FOR_RECYCLING: 9.5
              }
            }),
            receivedRowState({
              rowId: '1002',
              data: {
                DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
                TONNAGE_RECEIVED_FOR_RECYCLING: '9.5'
              }
            })
          ]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    const idx = buildHeaderRow(buildDataFieldColumns([])).indexOf(
      'TONNAGE_RECEIVED_FOR_RECYCLING'
    )
    const numberCell = out[1].trim().split(',')[idx]
    const stringCell = out[2].trim().split(',')[idx]
    expect(numberCell).toBe('9.5')
    expect(stringCell).toBe('9.5') // bare, not the quoted '"9.5"'
  })

  it('leaves data untouched when no schema matches the processing type', async () => {
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      seeds: [
        {
          rows: [
            receivedRowState({
              processingType: 'UNKNOWN_PROCESSING_TYPE',
              data: { SOME_FREE_COLUMN: 'kept' }
            })
          ]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    expect(out[1]).toContain('kept')
  })

  it('propagates errors from the row-state read', async () => {
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      seeds: [{ rows: [receivedRowState()] }]
    })
    deps.summaryLogRowStatesRepository.findRowStatesForSummaryLog = () =>
      Promise.reject(new Error('cursor died'))

    await expect(collect(streamCsvExport(deps))).rejects.toThrow('cursor died')
  })
})

describe('streamCsvExportToReadable', () => {
  it('returns a Readable stream that emits the same lines as the generator', async () => {
    const readable = streamCsvExportToReadable(await buildDeps())
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
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      seeds: [
        {
          rows: [
            receivedRowState({
              data: {
                DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
                BILL_OF_LANDING_REFERENCE_NUMBER: 'BL-99'
              }
            })
          ]
        }
      ]
    })
    const out = await collect(streamCsvExport(deps))
    expect(out[0]).toContain('BILL_OF_LANDING_REFERENCE_NUMBER')
    expect(out[1]).toContain('BL-99')
  })

  it('composes the header from the row-state distinct keys without buffering any row', async () => {
    const deps = await buildDeps({
      orgs: [baseOrg({ registrations: [baseRegistration()] })],
      seeds: [
        {
          rows: [
            receivedRowState({
              data: {
                DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
                WASTE_TRANSFER_NOTE: 'WTN-1'
              }
            })
          ]
        }
      ]
    })
    const findDistinctDataKeys = vi.spyOn(
      deps.summaryLogRowStatesRepository,
      'findDistinctDataKeys'
    )

    const out = await collect(streamCsvExport(deps))

    expect(findDistinctDataKeys).toHaveBeenCalledTimes(1)
    expect(out[0]).toContain('WASTE_TRANSFER_NOTE')
  })
})

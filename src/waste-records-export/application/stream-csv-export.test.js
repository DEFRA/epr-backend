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
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'

/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { LedgerEvent } from '#waste-balances/repository/ledger-schema.js' */

const collect = async (gen) => {
  const out = []
  for await (const row of gen) {
    out.push(row)
  }
  return out
}

const ORGANISATION_NUMBER = '500001'
const REGISTRATION_NUMBER = 'REG-1'

/**
 * An accreditation as the read model serves it, approved from `approvedOn`.
 *
 * @param {{ accreditationNumber?: string, status?: string, approvedOn?: string, overseasSites?: Record<string, any> }} [options]
 */
const readModelAccreditation = ({
  accreditationNumber = 'ACC-777',
  status = 'approved',
  approvedOn = '2026-01-01',
  overseasSites
} = {}) => ({
  accreditationNumber,
  prnIssuance: { tonnageBand: 'up_to_500' },
  status: {
    current: status,
    timeline: [
      { status: 'created', at: '2025-11-01T00:00:00.000Z' },
      { status: 'approved', at: `${approvedOn}T00:00:00.000Z` },
      ...(status === 'approved'
        ? []
        : [{ status, at: '2026-10-01T00:00:00.000Z' }])
    ]
  },
  ...(overseasSites && { overseasSites })
})

const reprocessorRegistration = (overrides = {}) => ({
  material: 'plastic',
  submittedToRegulator: { code: 'ea' },
  wasteProcessingType: 'reprocessor',
  reprocessingType: 'input',
  accreditations: {},
  ...overrides
})

const exporterRegistration = (overrides = {}) => ({
  material: 'plastic',
  submittedToRegulator: { code: 'ea' },
  wasteProcessingType: 'exporter',
  overseasSites: {},
  accreditations: {},
  ...overrides
})

const overseasSite = (name, country) => ({
  name,
  address: { line1: '1 Rue', townOrCity: 'Town', country }
})

/** A reprocessor registration holding `accreditations` by year. */
const accredited = (...accreditations) =>
  reprocessorRegistration({
    accreditations: Object.fromEntries(
      accreditations.map((accreditation, i) => [
        String(2026 - i),
        accreditation
      ])
    )
  })

const readModelOrg = ({
  organisationNumber = ORGANISATION_NUMBER,
  name = 'Acme Ltd',
  registrations = { [REGISTRATION_NUMBER]: reprocessorRegistration() }
} = {}) => ({ organisationNumber, name, registrations })

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

const exportedRowState = (overrides = {}) => ({
  rowId: '4001',
  wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
  processingType: PROCESSING_TYPES.EXPORTER,
  data: completeExportedData(),
  classification: naClassification(),
  ...overrides
})

/** An exporter whose accreditation lists site 001 as approved on `approvedOn`. */
const exporterWithSite = (approvedOn) =>
  exporterRegistration({
    overseasSites: { '001': overseasSite('Acme Recycling', 'Germany') },
    accreditations: {
      2026: readModelAccreditation({
        overseasSites: { '001': { status: 'approved', approvedOn } }
      })
    }
  })

// The ledger records a submission by its file id, and that is the id a row
// state's membership holds — deliberately unlike the summary log document's
// own id, so a lookup keyed by the wrong one misses.
const DEFAULT_SUMMARY_LOG_FILE_ID = 'file-1'

/**
 * A summary log document as `findAll` returns it: its own id, and the
 * file id the submission is addressed by.
 *
 * @param {string} fileId
 * @param {string} [submittedAt]
 */
const summaryLogDocument = (fileId, submittedAt) => ({
  id: `doc-${fileId}`,
  summaryLog: { file: { id: fileId }, ...(submittedAt && { submittedAt }) }
})

/**
 * Build export deps backed by the real in-memory ledger and row-state
 * adapters. `seeds` lists each partition's submitted summary log and its
 * committed rows; the ledger records one submitted event per seed so the
 * export resolves that summary log as the partition's latest.
 *
 * @param {{
 *   orgs?: any[],
 *   seeds?: any[],
 *   summaryLogs?: Record<string, any[]>,
 *   organisation?: any,
 *   registrationNumber?: RegistrationNumber
 * }} [options]
 */
const buildDeps = async ({
  orgs = [],
  seeds = [],
  summaryLogs = {},
  organisation,
  registrationNumber
} = {}) => {
  const ledgerIdOf = (seed) => ({
    organisationNumber: seed.organisationNumber ?? ORGANISATION_NUMBER,
    registrationNumber: seed.registrationNumber ?? REGISTRATION_NUMBER,
    accreditationNumber: seed.accreditationNumber ?? null
  })

  const ledgerEvents = seeds.map((seed) =>
    buildLedgerEvent({
      ...ledgerIdOf(seed),
      // A partition seeded twice needs ascending numbers so the later
      // submission is the one the latest-per-ledger query resolves.
      number: seed.number ?? 1,
      payload: {
        summaryLogId: seed.summaryLogId ?? DEFAULT_SUMMARY_LOG_FILE_ID,
        creditTotal: 0
      }
    })
  )
  const ledgerRepository = createInMemoryLedgerRepository(
    /** @type {LedgerEvent[]} */ (ledgerEvents)
  )()

  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStatesRepository()()
  for (const seed of seeds) {
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      ledgerIdOf(seed),
      seed.rows ?? [],
      seed.summaryLogId ?? DEFAULT_SUMMARY_LOG_FILE_ID
    )
  }

  return {
    organisationReadRepository: {
      findAll: async () => orgs
    },
    summaryLogRowStatesRepository,
    ledgerRepository,
    summaryLogsRepository: {
      findAll: async ({ organisationNumber, registrationNumber }) =>
        summaryLogs[`${organisationNumber}/${registrationNumber}`] ?? []
    },
    organisation,
    registrationNumber
  }
}

const cellsOf = (line) => line.trim().split(',')

const cellsByRowId = (out) =>
  new Map(
    out.slice(1).map((line) => {
      const cells = cellsOf(line)
      return [cells[METADATA_COL_INDEX['Row ID']], cells]
    })
  )

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
      orgs: [readModelOrg()],
      seeds: [{ rows: [receivedRowState()] }],
      summaryLogs: {
        '500001/REG-1': [
          summaryLogDocument(
            DEFAULT_SUMMARY_LOG_FILE_ID,
            '2026-04-15T09:00:00Z'
          )
        ]
      }
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(2)
    const cells = cellsOf(out[1])
    expect(cells[METADATA_COL_INDEX['Regulator']]).toBe('EA')
    expect(cells[METADATA_COL_INDEX['Organisation Name']]).toBe('Acme Ltd')
    expect(cells[METADATA_COL_INDEX['Registration Number']]).toBe('REG-1')
    expect(cells[METADATA_COL_INDEX['Material']]).toBe('plastic')
    expect(cells[METADATA_COL_INDEX['Operator Processing Type']]).toBe(
      'REPROCESSOR_INPUT'
    )
    expect(cells[METADATA_COL_INDEX['Waste Record Type']]).toBe('received')
    expect(cells[METADATA_COL_INDEX['Submitted At']]).toBe(
      '2026-04-15T09:00:00Z'
    )
    expect(cells[METADATA_COL_INDEX['Row ID']]).toBe('1001')
  })

  it('emits registration and accreditation numbers and the glass material', async () => {
    const deps = await buildDeps({
      orgs: [
        readModelOrg({
          registrations: {
            'REG-555': reprocessorRegistration({
              material: 'glass_re_melt',
              accreditations: { 2026: readModelAccreditation() }
            })
          }
        })
      ],
      seeds: [
        {
          registrationNumber: 'REG-555',
          accreditationNumber: 'ACC-777',
          rows: [receivedRowState()]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(2)
    const cells = cellsOf(out[1])
    expect(cells[METADATA_COL_INDEX['Registration Number']]).toBe('REG-555')
    expect(cells[METADATA_COL_INDEX['Material']]).toBe('glass_re_melt')
    expect(cells[METADATA_COL_INDEX['Accredited']]).toBe('Yes')
    expect(cells[METADATA_COL_INDEX['Accreditation Number']]).toBe('ACC-777')
  })

  it('serialises a numeric data field bare so it is a real number in the CSV', async () => {
    const deps = await buildDeps({
      orgs: [readModelOrg()],
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
    expect(cellsOf(out[1])[idx]).toBe('10') // bare, not the quoted '"10"'
  })

  it('apostrophe-prefixes a dangerous free-text value end to end', async () => {
    const deps = await buildDeps({
      orgs: [readModelOrg({ name: '=cmd|calc' })],
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
      orgs: [readModelOrg()],
      seeds: [{ rows: [receivedRowState()] }],
      summaryLogs: {}
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(2)
    expect(cellsOf(out[1])[METADATA_COL_INDEX['Submitted At']]).toBe('')
  })

  it('processes received, processed, sentOn and exported rows on the same registration', async () => {
    const deps = await buildDeps({
      orgs: [readModelOrg()],
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

  it('includes an exported row whose overseas site was approved before the export date', async () => {
    const deps = await buildDeps({
      orgs: [
        readModelOrg({
          registrations: {
            [REGISTRATION_NUMBER]: exporterWithSite('2026-01-01')
          }
        })
      ],
      seeds: [{ accreditationNumber: 'ACC-777', rows: [exportedRowState()] }]
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(2)
    expect(
      cellsOf(out[1])[METADATA_COL_INDEX['Included in Waste Balance']]
    ).toBe('true')
  })

  it('excludes an exported row whose overseas site is not yet approved on the export date', async () => {
    const deps = await buildDeps({
      orgs: [
        readModelOrg({
          registrations: {
            [REGISTRATION_NUMBER]: exporterWithSite('2026-09-01')
          }
        })
      ],
      seeds: [
        {
          accreditationNumber: 'ACC-777',
          rows: [
            exportedRowState({
              classification: {
                outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
                reasons: [],
                transactionAmount: 60.5
              }
            })
          ]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    const cells = cellsOf(out[1])
    expect(cells[METADATA_COL_INDEX['Included in Waste Balance']]).toBe('false')
    expect(
      cells[METADATA_COL_INDEX['Waste Balance Exclusion Reason']]
    ).toContain('ORS_NOT_APPROVED')
  })

  it('populates the derived OSR columns from the registration overseas site matched by OSR_ID', async () => {
    const deps = await buildDeps({
      orgs: [
        readModelOrg({
          registrations: {
            [REGISTRATION_NUMBER]: exporterRegistration({
              overseasSites: {
                '001': overseasSite('Acme Recycling', 'Germany')
              }
            })
          }
        })
      ],
      seeds: [
        {
          rows: [
            exportedRowState({
              data: { OSR_ID: '001', DATE_OF_EXPORT: '2026-03-01' }
            })
          ]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    const header = buildHeaderRow(buildDataFieldColumns([]))
    const cells = cellsOf(out[1])
    expect(cells[header.indexOf(OSR_COUNTRY_REVISED)]).toBe('Germany')
    expect(cells[header.indexOf(OSR_NAME_REVISED)]).toBe('Acme Recycling')
  })

  it('leaves the derived OSR columns blank for a reprocessor row with no OSR_ID', async () => {
    const deps = await buildDeps({
      orgs: [readModelOrg()],
      seeds: [{ rows: [receivedRowState()] }]
    })

    const out = await collect(streamCsvExport(deps))
    const header = buildHeaderRow(buildDataFieldColumns([]))
    const cells = cellsOf(out[1])
    expect(cells[header.indexOf(OSR_COUNTRY_REVISED)]).toBe('')
    expect(cells[header.indexOf(OSR_NAME_REVISED)]).toBe('')
  })

  it('includes a row the stamped classification ignored once the accreditation covers its date', async () => {
    const deps = await buildDeps({
      orgs: [
        readModelOrg({
          registrations: {
            [REGISTRATION_NUMBER]: accredited(readModelAccreditation())
          }
        })
      ],
      seeds: [
        {
          accreditationNumber: 'ACC-777',
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
    const cells = cellsOf(out[1])
    expect(cells[METADATA_COL_INDEX['Accredited']]).toBe('Yes')
    expect(cells[METADATA_COL_INDEX['Included in Waste Balance']]).toBe('true')
    expect(cells[METADATA_COL_INDEX['Waste Balance Exclusion Reason']]).toBe('')
    expect(Number(cells[METADATA_COL_INDEX['Waste Balance Tonnage']])).toBe(
      50.5
    )
  })

  it('ignores a row the stamped classification included once the accreditation no longer covers its date', async () => {
    const deps = await buildDeps({
      orgs: [
        readModelOrg({
          registrations: {
            [REGISTRATION_NUMBER]: accredited(
              readModelAccreditation({ approvedOn: '2026-07-01' })
            )
          }
        })
      ],
      seeds: [
        {
          accreditationNumber: 'ACC-777',
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
    const cells = cellsOf(out[1])
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
    const deps = await buildDeps({
      orgs: [
        readModelOrg({
          registrations: {
            [REGISTRATION_NUMBER]: accredited(readModelAccreditation())
          }
        })
      ],
      seeds: [
        {
          accreditationNumber: 'ACC-777',
          rows: [
            receivedRowState({ rowId: '1001', data: completeReceivedData() }),
            receivedRowState({ rowId: '1002', data: withoutTonnage })
          ]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    const included = cellsOf(out[1])
    const excluded = cellsOf(out[2])
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
    expect(excluded[METADATA_COL_INDEX['Waste Balance Exclusion Reason']]).toBe(
      'MISSING_REQUIRED_FIELD: TONNAGE_RECEIVED_FOR_RECYCLING'
    )
    expect(excluded[METADATA_COL_INDEX['Waste Balance Tonnage']]).toBe('')
  })

  it('reads Accredited "Yes" with the number for a suspended accreditation', async () => {
    const deps = await buildDeps({
      orgs: [
        readModelOrg({
          registrations: {
            [REGISTRATION_NUMBER]: accredited(
              readModelAccreditation({
                accreditationNumber: 'ACC-SUS-1',
                status: 'suspended'
              })
            )
          }
        })
      ],
      seeds: [{ accreditationNumber: 'ACC-SUS-1', rows: [receivedRowState()] }]
    })

    const cells = cellsOf((await collect(streamCsvExport(deps)))[1])
    expect(cells[METADATA_COL_INDEX['Accredited']]).toBe('Yes')
    expect(cells[METADATA_COL_INDEX['Accreditation Number']]).toBe('ACC-SUS-1')
  })

  it('still exports rows submitted under a since-cancelled accreditation, as Accredited "No"', async () => {
    // Row states are keyed by the accreditation number stamped at submission —
    // whatever its status — so a cancellation after submission must not drop
    // the registration's rows from the FOI export.
    const deps = await buildDeps({
      orgs: [
        readModelOrg({
          registrations: {
            [REGISTRATION_NUMBER]: accredited(
              readModelAccreditation({
                accreditationNumber: 'ACC-CAN-1',
                status: 'cancelled'
              })
            )
          }
        })
      ],
      seeds: [
        {
          accreditationNumber: 'ACC-CAN-1',
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
    expect(out).toHaveLength(2) // header + the row survives the cancellation
    const cells = cellsOf(out[1])
    expect(cells[METADATA_COL_INDEX['Accredited']]).toBe('No')
    expect(cells[METADATA_COL_INDEX['Accreditation Number']]).toBe('')
    expect(cells[METADATA_COL_INDEX['Included in Waste Balance']]).toBe('NA')
    expect(cells[METADATA_COL_INDEX['Waste Balance Tonnage']]).toBe('')
  })

  it('renders a partition whose accreditation the registration no longer holds as not accredited', async () => {
    const deps = await buildDeps({
      orgs: [readModelOrg()],
      seeds: [
        {
          accreditationNumber: 'ACC-GONE',
          rows: [receivedRowState({ data: completeReceivedData() })]
        }
      ]
    })

    const cells = cellsOf((await collect(streamCsvExport(deps)))[1])
    expect(cells[METADATA_COL_INDEX['Accredited']]).toBe('No')
    expect(cells[METADATA_COL_INDEX['Included in Waste Balance']]).toBe('NA')
  })

  it('renders each partition against its own accreditation, not the current one', async () => {
    const deps = await buildDeps({
      orgs: [
        readModelOrg({
          registrations: {
            [REGISTRATION_NUMBER]: accredited(
              readModelAccreditation({ accreditationNumber: 'ACC-NEW' }),
              readModelAccreditation({ accreditationNumber: 'ACC-OLD' })
            )
          }
        })
      ],
      seeds: [
        {
          accreditationNumber: 'ACC-OLD',
          summaryLogId: 'sl-old',
          rows: [receivedRowState({ rowId: '1001' })]
        },
        {
          accreditationNumber: 'ACC-NEW',
          summaryLogId: 'sl-new',
          rows: [receivedRowState({ rowId: '2002' })]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))

    expect(out).toHaveLength(3)
    const byRowId = cellsByRowId(out)
    expect(
      byRowId.get('1001')[METADATA_COL_INDEX['Accreditation Number']]
    ).toBe('ACC-OLD')
    expect(
      byRowId.get('2002')[METADATA_COL_INDEX['Accreditation Number']]
    ).toBe('ACC-NEW')
  })

  it('exports a registered-only period alongside an accredited one, as Accredited "No"', async () => {
    const deps = await buildDeps({
      orgs: [
        readModelOrg({
          registrations: {
            [REGISTRATION_NUMBER]: accredited(readModelAccreditation())
          }
        })
      ],
      seeds: [
        {
          summaryLogId: 'sl-registered-only',
          rows: [receivedRowState({ rowId: '1001' })]
        },
        {
          accreditationNumber: 'ACC-777',
          summaryLogId: 'sl-accredited',
          rows: [receivedRowState({ rowId: '2002' })]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))

    expect(out).toHaveLength(3)
    const byRowId = cellsByRowId(out)
    expect(byRowId.get('1001')[METADATA_COL_INDEX['Accredited']]).toBe('No')
    expect(
      byRowId.get('1001')[METADATA_COL_INDEX['Accreditation Number']]
    ).toBe('')
    expect(byRowId.get('2002')[METADATA_COL_INDEX['Accredited']]).toBe('Yes')
    expect(
      byRowId.get('2002')[METADATA_COL_INDEX['Accreditation Number']]
    ).toBe('ACC-777')
  })

  it("orders a registration's partitions registered-only first, then by accreditation number", async () => {
    const deps = await buildDeps({
      orgs: [
        readModelOrg({
          registrations: {
            [REGISTRATION_NUMBER]: accredited(
              readModelAccreditation({ accreditationNumber: 'ACC-B' }),
              readModelAccreditation({ accreditationNumber: 'ACC-A' })
            )
          }
        })
      ],
      seeds: [
        {
          accreditationNumber: 'ACC-B',
          summaryLogId: 'sl-b',
          rows: [receivedRowState({ rowId: '3003' })]
        },
        {
          summaryLogId: 'sl-null',
          rows: [receivedRowState({ rowId: '1001' })]
        },
        {
          accreditationNumber: 'ACC-A',
          summaryLogId: 'sl-a',
          rows: [receivedRowState({ rowId: '2002' })]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))

    expect(out).toHaveLength(4)
    expect(
      out.slice(1).map((line) => cellsOf(line)[METADATA_COL_INDEX['Row ID']])
    ).toEqual(['1001', '2002', '3003'])
  })

  it('orders organisations by organisation number and registrations by registration number', async () => {
    const beta = readModelOrg({
      organisationNumber: '500002',
      name: 'Beta',
      registrations: {
        'REG-2': reprocessorRegistration(),
        'REG-1': reprocessorRegistration()
      }
    })
    const alpha = readModelOrg({
      organisationNumber: '500001',
      name: 'Alpha',
      registrations: { 'REG-X': reprocessorRegistration() }
    })
    const deps = await buildDeps({
      orgs: [beta, alpha],
      seeds: [
        {
          organisationNumber: '500002',
          registrationNumber: 'REG-2',
          summaryLogId: 'sl-b2',
          rows: [receivedRowState()]
        },
        {
          organisationNumber: '500002',
          registrationNumber: 'REG-1',
          summaryLogId: 'sl-b1',
          rows: [receivedRowState()]
        },
        {
          organisationNumber: '500001',
          registrationNumber: 'REG-X',
          summaryLogId: 'sl-ax',
          rows: [receivedRowState()]
        }
      ]
    })

    const out = await collect(streamCsvExport(deps))

    expect(
      out.slice(1).map((line) => {
        const cells = cellsOf(line)
        return [
          cells[METADATA_COL_INDEX['Organisation Name']],
          cells[METADATA_COL_INDEX['Registration Number']]
        ]
      })
    ).toEqual([
      ['Alpha', 'REG-X'],
      ['Beta', 'REG-1'],
      ['Beta', 'REG-2']
    ])
  })

  it('emits rows sorted by (type, rowId) for determinism', async () => {
    const deps = await buildDeps({
      orgs: [readModelOrg()],
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
    expect(cellsOf(out[1])[METADATA_COL_INDEX['Row ID']]).toBe('1001')
    expect(cellsOf(out[2])[METADATA_COL_INDEX['Row ID']]).toBe('2002')
  })

  it('orders rowIds naturally so "9" comes before "10"', async () => {
    const deps = await buildDeps({
      orgs: [readModelOrg()],
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
    expect(cellsOf(out[1])[METADATA_COL_INDEX['Row ID']]).toBe('9')
    expect(cellsOf(out[2])[METADATA_COL_INDEX['Row ID']]).toBe('10')
  })

  it('renders a row with no active accreditation as NA with blank reason and tonnage', async () => {
    const deps = await buildDeps({
      orgs: [readModelOrg()],
      seeds: [{ rows: [receivedRowState()] }]
    })

    const cells = cellsOf((await collect(streamCsvExport(deps)))[1])
    expect(cells[METADATA_COL_INDEX['Included in Waste Balance']]).toBe('NA')
    expect(cells[METADATA_COL_INDEX['Waste Balance Exclusion Reason']]).toBe('')
    expect(cells[METADATA_COL_INDEX['Waste Balance Tonnage']]).toBe('')
  })

  it('contributes no rows for a submitted summary log that committed none', async () => {
    const deps = await buildDeps({
      orgs: [readModelOrg()],
      seeds: [{ rows: [] }]
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(1) // header only
  })

  it('contributes no rows for a registration with no submitted summary log', async () => {
    const deps = await buildDeps({ orgs: [readModelOrg()], seeds: [] })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(1) // header only
  })

  it('leaves out rows of a registration the read model does not serve', async () => {
    const deps = await buildDeps({
      orgs: [readModelOrg()],
      seeds: [
        { registrationNumber: 'REG-UNSERVED', rows: [receivedRowState()] }
      ]
    })

    const out = await collect(streamCsvExport(deps))
    expect(out).toHaveLength(1) // header only
  })

  it('excludes organisations configured as test organisations', async () => {
    // 999999 is set as a test organisation via process.env.TEST_ORGANISATIONS
    // in .vite/setup-files.js, matching the prod pattern of gating test orgs
    // out of admin-visible data.
    const deps = await buildDeps({
      orgs: [
        readModelOrg({ organisationNumber: '999999', name: 'Test Org' }),
        readModelOrg({ organisationNumber: '123456', name: 'Real Org' })
      ],
      seeds: [
        {
          organisationNumber: '999999',
          summaryLogId: 'sl-test',
          rows: [receivedRowState()]
        },
        {
          organisationNumber: '123456',
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

  it('exports only the given organisation and skips findAll when scoped to one', async () => {
    const org = readModelOrg({ name: 'Scoped Org' })
    const deps = await buildDeps({
      seeds: [{ rows: [receivedRowState()] }],
      organisation: org
    })
    const findAll = vi.spyOn(deps.organisationReadRepository, 'findAll')

    const out = await collect(streamCsvExport(deps))

    expect(findAll).not.toHaveBeenCalled()
    expect(out).toHaveLength(2)
    expect(out[1]).toContain('Scoped Org')
  })

  it('exports only the requested registration when scoped by registrationNumber', async () => {
    const org = readModelOrg({
      registrations: {
        'R26-1': reprocessorRegistration(),
        'R26-2': reprocessorRegistration()
      }
    })
    const deps = await buildDeps({
      seeds: [
        {
          registrationNumber: 'R26-1',
          summaryLogId: 'sl-1',
          rows: [receivedRowState()]
        },
        {
          registrationNumber: 'R26-2',
          summaryLogId: 'sl-2',
          rows: [receivedRowState({ rowId: '2001' })]
        }
      ],
      organisation: org,
      registrationNumber: /** @type {RegistrationNumber} */ ('R26-2')
    })

    const out = await collect(streamCsvExport(deps))

    expect(out).toHaveLength(2) // header + one row for R26-2 only
    expect(cellsOf(out[1])[METADATA_COL_INDEX['Row ID']]).toBe('2001')
  })

  it('includes a test organisation when the export is scoped to it', async () => {
    const testOrg = readModelOrg({
      organisationNumber: '999999',
      name: 'Test Org'
    })
    const deps = await buildDeps({
      seeds: [{ organisationNumber: '999999', rows: [receivedRowState()] }],
      organisation: testOrg
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
      orgs: [readModelOrg()],
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
    expect(cellsOf(out[1])[idx]).toBe('9.5')
    expect(cellsOf(out[2])[idx]).toBe('9.5') // bare, not the quoted '"9.5"'
  })

  it('leaves data untouched when no schema matches the processing type', async () => {
    const deps = await buildDeps({
      orgs: [readModelOrg()],
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
      orgs: [readModelOrg()],
      seeds: [{ rows: [receivedRowState()] }]
    })
    deps.summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog =
      () => Promise.reject(new Error('cursor died'))

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
      orgs: [readModelOrg()],
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
      orgs: [readModelOrg()],
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

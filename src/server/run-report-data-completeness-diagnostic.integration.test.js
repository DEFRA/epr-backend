import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObjectId } from 'mongodb'

import { createTestServer } from '#test/create-test-server.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { buildSummaryLogRowStateEntry } from '#waste-records/repository/test-data.js'
import {
  buildRegistration,
  buildOrganisation,
  buildOrganisationWithRegistration
} from '#repositories/organisations/contract/test-data.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { logger } from '#common/helpers/logging/logger.js'
import { runReportDataCompletenessDiagnostic } from './run-report-data-completeness-diagnostic.js'

/**
 * @import { Mock } from 'vitest'
 * @import { StartedServer } from '#common/hapi-types.js'
 */

/**
 * Builds one ledger's worth of estate fixture: an organisation carrying a single
 * registration (with a chosen material and template) plus the ledger id and the
 * summary-log id the diagnostic will scan.
 *
 * @param {{ material: string, processingType: string, summaryLogId: string, accredited: boolean }} spec
 */
const buildLedgerFixture = ({
  material,
  processingType,
  summaryLogId,
  accredited
}) => {
  const wasteProcessingType =
    processingType === PROCESSING_TYPES.REPROCESSOR_INPUT
      ? 'reprocessor'
      : 'exporter'
  const accreditationId = accredited ? new ObjectId().toString() : undefined
  const registration = buildRegistration({
    wasteProcessingType,
    material,
    ...(accredited ? { accreditationId } : {})
  })
  const org = accredited
    ? buildOrganisationWithRegistration(partialMock(registration), 'approved')
    : buildOrganisation({ registrations: [registration] })

  return {
    org,
    ledgerId: {
      organisationId: org.id,
      registrationId: registration.id,
      accreditationId: registration.accreditationId ?? null
    },
    summaryLogId,
    processingType
  }
}

describe('runReportDataCompletenessDiagnostic (integration)', () => {
  setupAuthContext()

  const LOCK_NAME = 'report-data-complete-diagnostic'

  // Ledger A: accredited exporter, plastic. Two Exported rows with export tonnage
  // but a blank OSR_ID (violating) alongside one fully complete Exported row, so
  // two of the three rows are counted (complete rows excluded) and OSR_ID is
  // missing twice. The specific rule that fires is the gate engine's concern and
  // is covered by the gate's own tests.
  const ledgerA = buildLedgerFixture({
    material: 'plastic',
    processingType: PROCESSING_TYPES.EXPORTER,
    summaryLogId: 'sl-a',
    accredited: true
  })
  const incompleteExportedRow = (rowId) =>
    buildSummaryLogRowStateEntry({
      rowId,
      wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
      processingType: PROCESSING_TYPES.EXPORTER,
      data: {
        DATE_OF_EXPORT: '2025-06-15',
        TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3
      }
    })
  const rowsA = [
    incompleteExportedRow('row-a-incomplete-1'),
    incompleteExportedRow('row-a-incomplete-2'),
    buildSummaryLogRowStateEntry({
      rowId: 'row-a-complete',
      wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
      processingType: PROCESSING_TYPES.EXPORTER,
      data: {
        DATE_OF_EXPORT: '2025-06-15',
        TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3,
        OSR_ID: 'ORS-0001'
      }
    })
  ]

  // Ledger B: registered-only exporter, glass. One Received row with received
  // tonnage and no supplier details: several missing fields on a single row,
  // which the diagnostic counts as one violating row.
  const ledgerB = buildLedgerFixture({
    material: 'glass',
    processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
    summaryLogId: 'sl-b',
    accredited: false
  })
  const rowsB = [
    buildSummaryLogRowStateEntry({
      rowId: 'row-b',
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
      data: { TONNAGE_RECEIVED_FOR_EXPORT: 5 }
    })
  ]

  // Ledger C: reprocessor, steel, an incomplete-looking row that has no
  // completeness policy yet -> scanned but never flagged (PAE-1280).
  const ledgerC = buildLedgerFixture({
    material: 'steel',
    processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
    summaryLogId: 'sl-c',
    accredited: true
  })
  const rowsC = [
    buildSummaryLogRowStateEntry({
      rowId: 'row-c',
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
      data: { TONNAGE_RECEIVED_FOR_RECYCLING: 5 }
    })
  ]

  const buildServer = async (featureFlags) => {
    const rowStates = createInMemorySummaryLogRowStatesRepository()()
    await rowStates.upsertSummaryLogRowStates(ledgerA.ledgerId, rowsA, 'sl-a')
    await rowStates.upsertSummaryLogRowStates(ledgerB.ledgerId, rowsB, 'sl-b')
    await rowStates.upsertSummaryLogRowStates(ledgerC.ledgerId, rowsC, 'sl-c')

    const ledgerRepository = createInMemoryLedgerRepository(
      [ledgerA, ledgerB, ledgerC].map((l) =>
        partialMock(
          buildLedgerEvent({
            organisationId: l.ledgerId.organisationId,
            registrationId: l.ledgerId.registrationId,
            accreditationId: l.ledgerId.accreditationId,
            payload: { summaryLogId: l.summaryLogId, creditTotal: 100 }
          })
        )
      )
    )()

    const server = await createTestServer({
      featureFlags,
      repositories: {
        organisationsRepository: createInMemoryOrganisationsRepository([
          partialMock(ledgerA.org),
          partialMock(ledgerB.org),
          partialMock(ledgerC.org)
        ]),
        ledgerRepository,
        summaryLogRowStatesRepository: rowStates
      }
    })

    const free = vi.fn()
    const lock = vi.fn().mockResolvedValue({ free })
    server.locker = partialMock({ lock })
    return {
      server: /** @type {StartedServer} */ (/** @type {unknown} */ (server)),
      lock,
      free
    }
  }

  const messages = () =>
    /** @type {Mock} */ (logger.info).mock.calls.map((call) => call[0].message)

  const warnings = () =>
    /** @type {Mock} */ (logger.warn).mock.calls.map((call) => call[0].message)

  beforeEach(() => {
    vi.spyOn(logger, 'info').mockImplementation(() => logger)
    vi.spyOn(logger, 'warn').mockImplementation(() => logger)
  })

  it('logs the estate-wide report-data completeness blast radius', async () => {
    const { server, lock, free } = await buildServer(
      createInMemoryFeatureFlags({ reportDataCompleteDiagnostic: true })
    )

    await runReportDataCompletenessDiagnostic(server)

    // (1) one line per violating summary log, with its counts and ids.
    const lineA = messages().find((m) => m.includes('sl-a'))
    expect(lineA).toContain('template EXPORTER,')
    expect(lineA).toContain('material plastic')
    expect(lineA).toContain(ledgerA.ledgerId.organisationId)
    expect(lineA).toContain(ledgerA.ledgerId.registrationId)
    expect(lineA).toContain(ledgerA.ledgerId.accreditationId)
    expect(lineA).toContain('2 incomplete row(s), 2 missing field(s)')

    const lineB = messages().find((m) => m.includes('sl-b'))
    expect(lineB).toContain('template EXPORTER_REGISTERED_ONLY,')
    expect(lineB).toContain('material glass')
    expect(lineB).toContain('registered-only')
    expect(lineB).toContain('1 incomplete row(s), 6 missing field(s)')

    // The reprocessor summary log is scanned but has no policy, so it is not
    // flagged.
    expect(messages().find((m) => m.includes('sl-c'))).toBeUndefined()

    // (2) one line covering the evaluated templates.
    expect(messages()).toContain(
      'Report-data diagnostic missing data by template: EXPORTER:1, EXPORTER_REGISTERED_ONLY:1'
    )

    // (3) one line covering every material, including those with no violations.
    expect(messages()).toContain(
      'Report-data diagnostic missing data by material: aluminium:0, fibre:0, glass:1, paper:0, plastic:1, steel:0, wood:0'
    )

    // (4) one line covering every missing field, most-missing first. OSR_ID is
    // missing on both of ledger A's violating rows; each supplier field once.
    expect(messages()).toContain(
      'Report-data diagnostic missing data by field: OSR_ID:2, ACTIVITIES_CARRIED_OUT_BY_SUPPLIER:1, SUPPLIER_ADDRESS:1, SUPPLIER_EMAIL:1, SUPPLIER_NAME:1, SUPPLIER_PHONE_NUMBER:1, SUPPLIER_POSTCODE:1'
    )

    // (5) the estate-wide totals.
    const summary = messages().find((m) =>
      m.startsWith('Report-data diagnostic summary:')
    )
    expect(summary).toContain('scanned 3 summary log(s)')
    expect(summary).toContain('2 with incomplete data (8 missing field(s))')
    expect(summary).toContain('2 organisation(s)')
    expect(summary).toContain('2 registration(s)')
    expect(summary).toContain('1 accreditation(s)')
    expect(summary).toContain(
      'Evaluated templates: EXPORTER, EXPORTER_REGISTERED_ONLY'
    )

    expect(lock).toHaveBeenCalledWith(LOCK_NAME)
    expect(free).toHaveBeenCalled()
  })

  it('keeps scanning and reports unknown material when a registration cannot be resolved', async () => {
    // A violating summary log whose registration is absent from the org repo
    // (deleted or re-versioned away). The scan must degrade this one line, not
    // abort: the finding is still counted, its material reported as unknown.
    const ledgerId = {
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString(),
      accreditationId: null
    }
    const rowStates = createInMemorySummaryLogRowStatesRepository()()
    await rowStates.upsertSummaryLogRowStates(
      ledgerId,
      [
        buildSummaryLogRowStateEntry({
          rowId: 'row-d',
          wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
          processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
          data: { TONNAGE_RECEIVED_FOR_EXPORT: 5 }
        })
      ],
      'sl-d'
    )
    const ledgerRepository = createInMemoryLedgerRepository([
      partialMock(
        buildLedgerEvent({
          organisationId: ledgerId.organisationId,
          registrationId: ledgerId.registrationId,
          accreditationId: null,
          payload: { summaryLogId: 'sl-d', creditTotal: 100 }
        })
      )
    ])()
    const server = /** @type {StartedServer} */ (
      /** @type {unknown} */ (
        await createTestServer({
          featureFlags: createInMemoryFeatureFlags({
            reportDataCompleteDiagnostic: true
          }),
          repositories: {
            organisationsRepository: createInMemoryOrganisationsRepository([]),
            ledgerRepository,
            summaryLogRowStatesRepository: rowStates
          }
        })
      )
    )
    server.locker = partialMock({
      lock: vi.fn().mockResolvedValue({ free: vi.fn() })
    })

    await runReportDataCompletenessDiagnostic(server)

    const lineD = messages().find((m) => m.includes('sl-d'))
    expect(lineD).toContain('material unknown')
    expect(lineD).toContain('1 incomplete row(s), 6 missing field(s)')

    // The finding still counts toward the estate totals and gets its own
    // material bucket appended after the known materials, so the per-material
    // rollup reconciles with the totals.
    expect(
      messages().find((m) => m.startsWith('Report-data diagnostic summary:'))
    ).toContain('1 with incomplete data (6 missing field(s))')
    expect(messages()).toContain(
      'Report-data diagnostic missing data by material: aluminium:0, fibre:0, glass:0, paper:0, plastic:0, steel:0, wood:0, unknown:1'
    )

    // A warning names the registration that could not be resolved.
    const warning = warnings().find((m) => m.includes('sl-d'))
    expect(warning).toContain(ledgerId.registrationId)
    expect(warning).toContain('material reported as unknown')
  })

  it('reports all-zero breakdowns when nothing would be blocked', async () => {
    // A single reprocessor summary log: it has no completeness policy, so it is
    // scanned but never flagged. The rollups still report, all zero, and the
    // field line reads (none).
    const ledger = buildLedgerFixture({
      material: 'steel',
      processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
      summaryLogId: 'sl-z',
      accredited: true
    })
    const rowStates = createInMemorySummaryLogRowStatesRepository()()
    await rowStates.upsertSummaryLogRowStates(
      ledger.ledgerId,
      [
        buildSummaryLogRowStateEntry({
          rowId: 'row-z',
          wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
          processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
          data: { TONNAGE_RECEIVED_FOR_RECYCLING: 5 }
        })
      ],
      'sl-z'
    )
    const ledgerRepository = createInMemoryLedgerRepository([
      partialMock(
        buildLedgerEvent({
          organisationId: ledger.ledgerId.organisationId,
          registrationId: ledger.ledgerId.registrationId,
          accreditationId: ledger.ledgerId.accreditationId,
          payload: { summaryLogId: 'sl-z', creditTotal: 100 }
        })
      )
    ])()
    const server = /** @type {StartedServer} */ (
      /** @type {unknown} */ (
        await createTestServer({
          featureFlags: createInMemoryFeatureFlags({
            reportDataCompleteDiagnostic: true
          }),
          repositories: {
            organisationsRepository: createInMemoryOrganisationsRepository([
              partialMock(ledger.org)
            ]),
            ledgerRepository,
            summaryLogRowStatesRepository: rowStates
          }
        })
      )
    )
    server.locker = partialMock({
      lock: vi.fn().mockResolvedValue({ free: vi.fn() })
    })

    await runReportDataCompletenessDiagnostic(server)

    expect(messages().find((m) => m.includes('sl-z'))).toBeUndefined()
    expect(messages()).toContain(
      'Report-data diagnostic missing data by template: EXPORTER:0, EXPORTER_REGISTERED_ONLY:0'
    )
    expect(messages()).toContain(
      'Report-data diagnostic missing data by material: aluminium:0, fibre:0, glass:0, paper:0, plastic:0, steel:0, wood:0'
    )
    expect(messages()).toContain(
      'Report-data diagnostic missing data by field: (none)'
    )
    expect(
      messages().find((m) => m.startsWith('Report-data diagnostic summary:'))
    ).toContain(
      'scanned 1 summary log(s), 0 with incomplete data (0 missing field(s))'
    )
  })

  it('does nothing when the feature flag is off', async () => {
    const { server, lock } = await buildServer(createInMemoryFeatureFlags())

    await runReportDataCompletenessDiagnostic(server)

    expect(lock).not.toHaveBeenCalled()
    expect(
      messages().filter((m) => m.startsWith('Report-data diagnostic'))
    ).toHaveLength(0)
  })
})

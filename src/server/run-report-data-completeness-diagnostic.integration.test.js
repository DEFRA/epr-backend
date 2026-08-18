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

  // Ledger A: accredited exporter, plastic, one Exported row with export tonnage
  // and a blank OSR_ID -> one violating row (AC2).
  const ledgerA = buildLedgerFixture({
    material: 'plastic',
    processingType: PROCESSING_TYPES.EXPORTER,
    summaryLogId: 'sl-a',
    accredited: true
  })
  const rowsA = [
    buildSummaryLogRowStateEntry({
      rowId: 'row-a',
      wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
      processingType: PROCESSING_TYPES.EXPORTER,
      data: {
        DATE_OF_EXPORT: '2025-06-15',
        TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3
      }
    })
  ]

  // Ledger B: registered-only exporter, glass, one Received row with received
  // tonnage and no supplier details -> one violating row (AC1).
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

  beforeEach(() => {
    vi.spyOn(logger, 'info').mockImplementation(() => logger)
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
    expect(lineA).toContain('1 incomplete row(s)')

    const lineB = messages().find((m) => m.includes('sl-b'))
    expect(lineB).toContain('template EXPORTER_REGISTERED_ONLY,')
    expect(lineB).toContain('material glass')
    expect(lineB).toContain('registered-only')
    expect(lineB).toContain('1 incomplete row(s)')

    // The reprocessor summary log is scanned but has no policy, so it is not
    // flagged.
    expect(messages().find((m) => m.includes('sl-c'))).toBeUndefined()

    // (2) one line per evaluated template.
    expect(messages()).toContain(
      'Report-data diagnostic by template: EXPORTER -- 1 summary log(s) with incomplete data'
    )
    expect(messages()).toContain(
      'Report-data diagnostic by template: EXPORTER_REGISTERED_ONLY -- 1 summary log(s) with incomplete data'
    )

    // (3) one line per material, including materials with no violations.
    expect(messages()).toContain(
      'Report-data diagnostic by material: plastic -- 1 summary log(s) with incomplete data'
    )
    expect(messages()).toContain(
      'Report-data diagnostic by material: glass -- 1 summary log(s) with incomplete data'
    )
    expect(messages()).toContain(
      'Report-data diagnostic by material: aluminium -- 0 summary log(s) with incomplete data'
    )

    // (4) the estate-wide totals.
    const summary = messages().find((m) =>
      m.startsWith('Report-data diagnostic summary:')
    )
    expect(summary).toContain('scanned 3 summary log(s)')
    expect(summary).toContain('2 with incomplete data')
    expect(summary).toContain('2 organisation(s)')
    expect(summary).toContain('2 registration(s)')
    expect(summary).toContain('1 accreditation(s)')
    expect(summary).toContain(
      'Evaluated templates: EXPORTER, EXPORTER_REGISTERED_ONLY'
    )

    expect(lock).toHaveBeenCalledWith(LOCK_NAME)
    expect(free).toHaveBeenCalled()
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

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup as setupMongo, teardown as teardownMongo } from 'vitest-mongodb'
import { randomUUID } from 'node:crypto'

import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { findUnexportedTonnageReports } from '#reports/monitoring/unexported-tonnage.js'
import { createAndSubmitReport } from '#reports/repository/contract/test-data.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { buildSummaryLogRowStateEntry } from '#waste-records/repository/test-data.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { unexportedTonnageDependencies } from './run-unexported-tonnage-report.js'

/**
 * @import { StartedServer } from '#common/hapi-types.js'
 */

vi.mock(
  '#adapters/sqs-command-executor/sqs-command-executor.plugin.js',
  async () => import('#adapters/sqs-command-executor/mock.plugin.js')
)
vi.mock(
  '#plugins/dlq-admin.js',
  async () => import('#plugins/dlq-admin.mock.plugin.js')
)

const startMongo = async () => {
  await setupMongo()
  process.env.MONGO_URI = globalThis.__MONGO_URI__
}

const bootServer = async () => {
  process.env.MONGO_DATABASE = `epr-backend-test-${randomUUID()}`
  const { createServer } = await import('#server/server.js')
  const server = await createServer()
  await server.initialize()

  return /** @type {StartedServer} */ (/** @type {unknown} */ (server))
}

describe('unexported tonnage diagnostic wiring', () => {
  setupAuthContext()

  let server

  beforeAll(async () => {
    await startMongo()
    server = await bootServer()
  })

  afterAll(async () => {
    await server.db.dropDatabase()
    await server.stop()
    await teardownMongo()
  })

  it('resolves every repository it reads against a real booted server', () => {
    const unresolved = Object.entries(unexportedTonnageDependencies(server))
      .filter(([, repository]) => repository === undefined)
      .map(([name]) => name)

    expect(unresolved).toStrictEqual([])
  })

  it('sizes a masked over-export end-to-end, reading real persisted rows', async () => {
    // An accredited plastic exporter: take the canonical fixture organisation
    // and link its exporter registration to its exporter accreditation, so the
    // over-exporting rows are read off a real accreditation ledger.
    const organisation = buildOrganisation()
    const registration = organisation.registrations.find(
      (reg) => reg.wasteProcessingType === 'exporter'
    )
    const accreditation = organisation.accreditations.find(
      (acc) => acc.wasteProcessingType === 'exporter'
    )
    if (!registration || !accreditation) {
      throw new Error(
        'fixture organisation must carry an exporter registration and accreditation'
      )
    }
    registration.accreditationId = accreditation.id
    await server.app.organisationsRepository.insert(organisation)

    const organisationId = organisation.id
    const registrationId = registration.id
    const summaryLogId = 'sl-1'

    // One summary log carrying a masked over-export: an impossible T>S row
    // (exported 80 against 50 received, net -30) whose loss is absorbed by a
    // plain 100t unexported load, so the log still nets positive (+70) and the
    // over-export never surfaces in the log's own total.
    await server.app.summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      { organisationId, registrationId, accreditationId: accreditation.id },
      [
        buildSummaryLogRowStateEntry({
          rowId: 'row-over-export',
          processingType: PROCESSING_TYPES.EXPORTER,
          data: {
            DATE_RECEIVED_FOR_EXPORT: '2024-01-15',
            TONNAGE_RECEIVED_FOR_EXPORT: 50,
            TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 80
          }
        }),
        buildSummaryLogRowStateEntry({
          rowId: 'row-unexported',
          processingType: PROCESSING_TYPES.EXPORTER,
          data: {
            DATE_RECEIVED_FOR_EXPORT: '2024-01-20',
            TONNAGE_RECEIVED_FOR_EXPORT: 100,
            TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 0
          }
        })
      ],
      summaryLogId
    )

    // The stored figure agrees with the recompute (0 clamped + 100 = 100), so
    // there is no mismatch finding — the over-export record is still collected,
    // which is the behaviour under test.
    const exportActivity = {
      overseasSites: [],
      unapprovedOverseasSites: [],
      totalTonnageExported: 80,
      tonnageRefusedAtDestination: 0,
      tonnageStoppedDuringExport: 0,
      totalTonnageRefusedOrStopped: 0,
      tonnageRepatriated: 0,
      tonnageReceivedNotExported: 100
    }
    await createAndSubmitReport(server.app.reportsRepository, {
      organisationId,
      registrationId,
      wasteProcessingType: 'exporter',
      material: 'plastic',
      source: { summaryLogId, lastUploadedAt: '2026-04-01T00:00:00.000Z' },
      exportActivity
    })

    const { scanned, findings, overExportRecords } =
      await findUnexportedTonnageReports(unexportedTonnageDependencies(server))

    expect(scanned).toBe(1)
    expect(findings).toStrictEqual([])
    expect(overExportRecords).toStrictEqual([
      {
        organisationId,
        registrationId,
        material: 'plastic',
        rowsNegative: 1,
        negativeMagnitude: 30,
        netNegative: false
      }
    ])
  })
})

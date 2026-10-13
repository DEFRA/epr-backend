import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { describe, expect, vi } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { createReportsRepository } from '#reports/repository/mongodb.js'
import { createAndSubmitReport } from '#reports/repository/contract/test-data.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { config } from '../config.js'

import { runClearUnwarrantedResubmissionFlags } from './run-clear-unwarranted-resubmission-flags.js'

// The shell's control flow is unit-tested with mocks in
// run-clear-unwarranted-resubmission-flags.test.js. This exercises the real
// dependency graph against a real database, so a wiring regression cannot pass
// silently (the sweep is fire-and-forget, so a broken graph would only log).
vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../config.js', async (importOriginal) => {
  const { config: actual } = /** @type {typeof import('../config.js')} */ (
    await importOriginal()
  )
  return {
    config: {
      get: vi.fn((key) =>
        key === 'featureFlags.clearUnwarrantedResubmissionFlags'
          ? true
          : actual.get(key)
      )
    }
  }
})

const DATABASE_NAME = 'epr-backend'

const grantingLocker = () => ({
  lock: async () => ({ free: async () => {} })
})

const it = mongoIt.extend({
  mongoClient: async (/** @type {*} */ { db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },
  database: async (/** @type {*} */ { mongoClient }, use) => {
    await use(mongoClient.db(DATABASE_NAME))
  }
})

/**
 * A report submitted before any summary log, flagged by a later upload whose
 * ledger has no submission either: both sides rebuild to the same empty
 * figures, so the flag is unwarranted.
 */
const seedUnwarrantedFlag = async (/** @type {*} */ database) => {
  const organisation = buildOrganisation()
  const [registration] = organisation.registrations
  await (await createOrganisationsRepository(database))().insert(organisation)

  await (
    await createSummaryLogsRepository(database, {
      s3Client: /** @type {*} */ ({}),
      preSignedUrlExpiry: 60
    })
  )(logger).insert(
    'sl-restated',
    summaryLogFactory.submitted({
      organisationId: organisation.id,
      registrationId: registration.id
    })
  )

  const reportsRepository = (await createReportsRepository(database))()
  const reportId = await createAndSubmitReport(reportsRepository, {
    organisationId: organisation.id,
    registrationId: registration.id,
    source: { summaryLogId: null, lastUploadedAt: null }
  })
  await reportsRepository.markSubmittedReportsRequiringResubmission({
    organisationId: organisation.id,
    registrationId: registration.id,
    summaryLogId: 'sl-restated',
    uploadedAt: '2026-05-01T00:00:00.000Z',
    periods: [{ year: 2024, cadence: 'monthly', period: 1 }]
  })

  return { reportsRepository, reportId }
}

describe('runClearUnwarrantedResubmissionFlags (integration)', () => {
  it('wires the real dependencies and clears an unwarranted flag end to end', async (/** @type {*} */ {
    database
  }) => {
    const { reportsRepository, reportId } = await seedUnwarrantedFlag(database)
    const server = /** @type {*} */ ({
      db: database,
      locker: grantingLocker()
    })

    await runClearUnwarrantedResubmissionFlags(server)

    expect(logger.error).not.toHaveBeenCalled()
    const report = await reportsRepository.findReportById(reportId)
    expect(report.resubmissionRequired).toBeUndefined()
    expect(config.get).toHaveBeenCalledWith(
      'featureFlags.clearUnwarrantedResubmissionFlags'
    )
    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringMatching(
        /^Clear unwarranted resubmission flags \(repair\): flagged=\d+ cleared=[1-9]/
      )
    })
  })
})

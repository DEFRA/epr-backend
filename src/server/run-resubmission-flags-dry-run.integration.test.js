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

import { runResubmissionFlagsDryRun } from './run-resubmission-flags-dry-run.js'

// The shell's control flow is unit-tested with mocks in
// run-resubmission-flags-dry-run.test.js. This exercises the real
// dependency graph against a real database, so a wiring regression cannot pass
// silently (the sweep is fire-and-forget, so a broken graph would only log).
vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
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

describe('runResubmissionFlagsDryRun (integration)', () => {
  it('wires the real dependencies and reports an unwarranted flag without clearing it', async (/** @type {*} */ {
    database
  }) => {
    const { reportsRepository, reportId } = await seedUnwarrantedFlag(database)
    const flagged = await reportsRepository.findReportById(reportId)
    const server = /** @type {*} */ ({
      db: database,
      locker: grantingLocker()
    })

    await runResubmissionFlagsDryRun(server)

    expect(logger.error).not.toHaveBeenCalled()
    expect(await reportsRepository.findReportById(reportId)).toEqual(flagged)
    expect(logger.info).toHaveBeenCalledWith({
      message: expect.stringMatching(
        /^Resubmission flags dry run: flagged=\d+ wouldClear=[1-9]/
      )
    })
  })
})

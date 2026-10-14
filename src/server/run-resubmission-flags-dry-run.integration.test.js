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

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

const DATABASE_NAME = 'epr-backend'
const JANUARY_2024 = { year: 2024, cadence: 'monthly', period: 1 }

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
 * A submitted report flagged by a summary log whose ledger holds no
 * submission, so there is no current data to compare against.
 */
const seedFlagWithoutCurrentData = async (/** @type {*} */ database) => {
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
  await createAndSubmitReport(reportsRepository, {
    organisationId: organisation.id,
    registrationId: registration.id,
    ...JANUARY_2024
  })
  await reportsRepository.markSubmittedReportsRequiringResubmission({
    organisationId: organisation.id,
    registrationId: registration.id,
    summaryLogId: 'sl-restated',
    uploadedAt: '2026-05-01T00:00:00.000Z',
    periods: [JANUARY_2024]
  })
}

describe('runResubmissionFlagsDryRun (integration)', () => {
  it('evaluates flags through the real repositories', async (/** @type {*} */ {
    database
  }) => {
    await seedFlagWithoutCurrentData(database)
    const server = /** @type {*} */ ({
      db: database,
      locker: grantingLocker()
    })

    await runResubmissionFlagsDryRun(server)

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Resubmission flags dry run: flagged=1 wouldClear=0 keptOperatorRequested=0 keptResubmissionInProgress=0 keptFiguresChanged=0 keptCannotCompare=1 failed=0'
    })
  })
})

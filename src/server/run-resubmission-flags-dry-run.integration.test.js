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
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'

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
 * A report submitted before any summary log, flagged by a later submission
 * with no rows: both sides rebuild to the same empty figures.
 */
const seedUnwarrantedFlag = async (/** @type {*} */ database) => {
  const organisation = buildOrganisation()
  const [registration] = organisation.registrations
  await (await createOrganisationsRepository(database))().insert(organisation)

  const summaryLog = summaryLogFactory.submitted({
    organisationId: organisation.id,
    registrationId: registration.id
  })
  await (
    await createSummaryLogsRepository(database, {
      s3Client: /** @type {*} */ ({}),
      preSignedUrlExpiry: 60
    })
  )(logger).insert('sl-restated', summaryLog)
  await (
    await createMongoLedgerRepository(database)
  )().appendEvents([
    buildLedgerEvent({
      organisationId: organisation.id,
      registrationId: registration.id,
      accreditationId: summaryLog.accreditationId,
      payload: { summaryLogId: summaryLog.file.id, creditTotal: 0 }
    })
  ])

  const reportsRepository = (await createReportsRepository(database))()
  await createAndSubmitReport(reportsRepository, {
    organisationId: organisation.id,
    registrationId: registration.id,
    ...JANUARY_2024,
    source: { summaryLogId: null, lastUploadedAt: null }
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
    await seedUnwarrantedFlag(database)
    const server = /** @type {*} */ ({
      db: database,
      locker: grantingLocker()
    })

    await runResubmissionFlagsDryRun(server)

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Resubmission flags dry run: flagged=1 wouldClear=1 keptOperatorRequested=0 keptResubmissionInProgress=0 keptFiguresChanged=0 keptCannotCompare=0 failed=0'
    })
  })
})

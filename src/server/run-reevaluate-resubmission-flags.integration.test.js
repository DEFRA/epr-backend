import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { randomUUID } from 'node:crypto'
import { MongoClient } from 'mongodb'
import { describe, expect, onTestFinished, vi } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { config } from '#root/config.js'
import { createReportsRepository } from '#reports/repository/mongodb.js'
import { createAndSubmitReport } from '#reports/repository/contract/test-data.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createSummaryLogsRepository } from '#repositories/summary-logs/mongodb.js'
import { summaryLogFactory } from '#repositories/summary-logs/contract/test-data.js'
import { createMongoLedgerRepository } from '#waste-balances/repository/ledger-mongodb.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'

import { runReevaluateResubmissionFlags } from './run-reevaluate-resubmission-flags.js'

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
    // The sweep reads every report, so each test needs a database of its own.
    await use(mongoClient.db(`${DATABASE_NAME}-${randomUUID()}`))
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
  const reportId = await createAndSubmitReport(reportsRepository, {
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
  return { reportsRepository, reportId }
}

describe('runReevaluateResubmissionFlags (integration)', () => {
  it('evaluates flags through the real repositories', async (/** @type {*} */ {
    database
  }) => {
    await seedUnwarrantedFlag(database)
    const server = /** @type {*} */ ({
      db: database,
      locker: grantingLocker()
    })

    await runReevaluateResubmissionFlags(server)

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Resubmission flags dry run: flagged=1 wouldClear=1 cleared=0 skipped=0 keptOperatorRequested=0 keptResubmissionInProgress=0 keptFiguresChanged=0 keptCannotCompare=0 failed=0'
    })
  })

  it('clears the flag through the real repositories while the clearing flag is on', async (/** @type {*} */ {
    database
  }) => {
    const { reportsRepository, reportId } = await seedUnwarrantedFlag(database)
    const get = config.get.bind(config)
    vi.spyOn(config, 'get').mockImplementation(
      (/** @type {*} */ key) =>
        key === 'featureFlags.clearUnwarrantedResubmissionFlags' || get(key)
    )
    onTestFinished(() => {
      vi.restoreAllMocks()
    })
    const server = /** @type {*} */ ({
      db: database,
      locker: grantingLocker()
    })

    await runReevaluateResubmissionFlags(server)

    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Resubmission flags repair: flagged=1 wouldClear=0 cleared=1 skipped=0 keptOperatorRequested=0 keptResubmissionInProgress=0 keptFiguresChanged=0 keptCannotCompare=0 failed=0'
    })
    const report = await reportsRepository.findReportById(reportId)
    expect(report.resubmissionRequired).toBeUndefined()
  })
})

import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { describe, beforeEach, expect, vi } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  createPackagingRecyclingNotesRepository,
  COLLECTION_NAME as PACKAGING_RECYCLING_NOTES_COLLECTION_NAME
} from '#packaging-recycling-notes/repository/mongodb.js'
import {
  buildAccreditationId,
  buildAwaitingAcceptancePrn,
  underAccreditation
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import {
  ensureLedgerCollection,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from '#waste-balances/repository/ledger-mongodb.js'
import { buildPrnRejectedEvent } from '#waste-balances/repository/ledger-test-data.js'
import { config } from '../config.js'

import { runReconcileStalePrnProjections } from './run-reconcile-stale-prn-projections.js'

// The shell's control flow (lock held, flag off, errors) is unit-tested with
// mocks in run-reconcile-stale-prn-projections.test.js. This exercises the real
// dependency graph `buildDependencies` assembles: detection query, repository
// and ledger service against a real database, so a wiring regression cannot pass
// silently (the sweep is fire-and-forget, so a broken graph would only log).
vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../config.js', () => ({ config: { get: vi.fn() } }))

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
 * Seeds a PRN stored at `awaiting_acceptance` with watermark 2 and a rejection
 * at slot 3 it has never applied, so its stored status lags its ledger.
 */
const seedDriftingPrn = async (/** @type {*} */ database) => {
  const factory = await createPackagingRecyclingNotesRepository(database, [])
  const repo = factory(logger)
  await ensureLedgerCollection(database)
  const ids = buildAccreditationId()
  const created = await repo.create(
    buildAwaitingAcceptancePrn({
      ...underAccreditation(ids),
      lastAppliedEventNumber: 2
    })
  )
  await database.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME).insertOne(
    buildPrnRejectedEvent({
      ...ids,
      number: 3,
      payload: { prnId: created.id, amount: 50 }
    })
  )
  return created
}

describe('runReconcileStalePrnProjections (integration)', () => {
  beforeEach(async (/** @type {*} */ { database }) => {
    vi.clearAllMocks()
    await database
      .collection(PACKAGING_RECYCLING_NOTES_COLLECTION_NAME)
      .deleteMany({})
    await ensureLedgerCollection(database)
    await database
      .collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
      .deleteMany({})
  })

  it('wires the real dependencies and repairs a drifting PRN end to end', async (/** @type {*} */ {
    database
  }) => {
    vi.mocked(config.get).mockReturnValue(true) // repair mode
    const created = await seedDriftingPrn(database)
    const server = /** @type {*} */ ({
      db: database,
      locker: grantingLocker()
    })

    await runReconcileStalePrnProjections(server)

    const stored = await database
      .collection(PACKAGING_RECYCLING_NOTES_COLLECTION_NAME)
      .findOne({ _id: ObjectId.createFromHexString(created.id) })
    expect(stored.status.currentStatus).toBe(PRN_STATUS.AWAITING_CANCELLATION)
    expect(stored.version).toBe(2)
    expect(stored.lastAppliedEventNumber).toBe(3)
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Reconcile stale PRN projections (repair): total=1 drifting=1 repaired=1 folded=1 stamped=0 stillDrifting=0 failed=0'
    })
  })
})

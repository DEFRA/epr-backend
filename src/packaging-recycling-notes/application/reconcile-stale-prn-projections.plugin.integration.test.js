import Hapi from '@hapi/hapi'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { describe, beforeEach, afterEach, expect, vi } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { packagingRecyclingNotesRepositoryPlugin } from '#packaging-recycling-notes/plugin.js'
import {
  buildAccreditationKeys,
  buildAwaitingAcceptancePrn,
  underAccreditation
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import {
  COLLECTION_NAME as PACKAGING_RECYCLING_NOTES_COLLECTION_NAME,
  createMongoPackagingRecyclingNotesRepository
} from '#packaging-recycling-notes/repository/mongodb.js'
import {
  ensureLedgerCollection,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from '#waste-balances/repository/ledger-mongodb.js'
import { mongoLedgerRepositoryPlugin } from '#waste-balances/repository/ledger-mongodb.plugin.js'
import { mongoWasteBalanceServicePlugin } from '#waste-balances/repository/mongodb.plugin.js'
import { buildPrnRejectedEvent } from '#waste-balances/repository/ledger-test-data.js'

import { reconcileStalePrnProjectionsPlugin } from './reconcile-stale-prn-projections.plugin.js'

// The shell's control flow (lock held, errors) is unit-tested with mocks in
// run-reconcile-stale-prn-projections.test.js. This starts a server with the
// production PRN and ledger repository plugins and the sweep's plugin over a
// real database, because the sweep is fire-and-forget and a broken wiring
// would only log.
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
 * Seeds a PRN stored at `awaiting_acceptance` with watermark 2 and a rejection
 * at slot 3 it has never applied, so its stored status lags its ledger.
 *
 * @param {import('mongodb').Db} database
 */
const seedDriftingPrn = async (database) => {
  const ids = buildAccreditationKeys()
  const repository = (
    await createMongoPackagingRecyclingNotesRepository(database, [])
  )(logger)
  const created = await repository.create(
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
  return created.id
}

/** @param {import('mongodb').Db} database */
const databaseProvider = (database) => ({
  name: 'mongodb',
  register: (/** @type {*} */ server) => {
    server.decorate('server', 'db', database)
    server.decorate('server', 'locker', grantingLocker())
  }
})

describe('reconcileStalePrnProjectionsPlugin (integration)', () => {
  /** @type {*} */
  let server

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

  afterEach(async () => {
    await server?.stop()
  })

  it('repairs a drifting PRN once a server with the production repositories starts', async (/** @type {*} */ {
    database
  }) => {
    const id = await seedDriftingPrn(database)
    server = Hapi.server()
    server.decorate('server', 'logger', logger)
    await server.register(databaseProvider(database))
    await server.register([
      {
        plugin: packagingRecyclingNotesRepositoryPlugin,
        options: { excludeOrganisationNumbers: [] }
      },
      mongoLedgerRepositoryPlugin,
      mongoWasteBalanceServicePlugin,
      reconcileStalePrnProjectionsPlugin
    ])

    await server.start()

    await vi.waitFor(
      () =>
        expect(logger.info).toHaveBeenCalledWith({
          message:
            'Reconcile stale PRN projections: total=1 drifting=1 repaired=1 folded=1 stamped=0 stillDrifting=0 failed=0'
        }),
      { timeout: 5000 }
    )
    const stored = await database
      .collection(PACKAGING_RECYCLING_NOTES_COLLECTION_NAME)
      .findOne({ _id: ObjectId.createFromHexString(id) })
    expect(stored.status.currentStatus).toBe(PRN_STATUS.AWAITING_CANCELLATION)
    expect(stored.version).toBe(2)
    expect(stored.lastAppliedEventNumber).toBe(3)
  })
})

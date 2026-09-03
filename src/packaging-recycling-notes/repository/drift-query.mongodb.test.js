import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { describe, beforeEach, expect, vi } from 'vitest'

import {
  createPackagingRecyclingNotesRepository,
  COLLECTION_NAME as PACKAGING_RECYCLING_NOTES_COLLECTION_NAME
} from './mongodb.js'
import {
  buildAccreditationId,
  buildAwaitingAcceptancePrn,
  underAccreditation
} from './contract/test-data.js'
import {
  ensureLedgerCollection,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from '#waste-balances/repository/ledger-mongodb.js'
import { buildPrnRejectedEvent } from '#waste-balances/repository/ledger-test-data.js'

import { createDriftQuery } from './drift-query.mongodb.js'

const DATABASE_NAME = 'epr-backend'

/**
 * @typedef {import('#common/helpers/logging/logger.js').TypedLogger} TypedLogger
 */

/** A complete TypedLogger stub — the repository factory logs nothing here. */
const stubLogger = () =>
  /** @type {TypedLogger} */ ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn()
  })

const it = mongoIt.extend({
  mongoClient: async (/** @type {*} */ { db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  database: async (/** @type {*} */ { mongoClient }, use) => {
    await use(mongoClient.db(DATABASE_NAME))
  },

  prnCollection: async (/** @type {*} */ { database }, use) => {
    // Constructing the repository ensures the collection and its indexes.
    await createPackagingRecyclingNotesRepository(database, [])
    await use(database.collection(PACKAGING_RECYCLING_NOTES_COLLECTION_NAME))
  },

  prnRepository: async (/** @type {*} */ { database }, use) => {
    const factory = await createPackagingRecyclingNotesRepository(database, [])
    await use(factory(stubLogger()))
  },

  ledgerCollection: async (/** @type {*} */ { database }, use) => {
    await ensureLedgerCollection(database)
    await use(database.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME))
  },

  findDrifting: async (/** @type {*} */ { database }, use) => {
    await use(createDriftQuery(database))
  }
})

// The behind / level / no-watermark detection cases are exercised end to end by
// reconcile-stale-prn-projections.test.js, which drives this same real query. The
// one property that cannot be checked through the reconciler is the false-positive
// trap below: if this query wrongly flagged a level sibling, the reconciler would
// re-read it, fold to nothing, and skip it as `current`, silently masking the
// regression. So the trap is asserted directly on the query's output.
describe('createDriftQuery', () => {
  beforeEach(async (/** @type {*} */ { prnCollection, ledgerCollection }) => {
    await prnCollection.deleteMany({})
    await ledgerCollection.deleteMany({})
  })

  it('does not falsely flag a sibling PRN when another in its partition advances', async (/** @type {*} */ {
    prnRepository,
    ledgerCollection,
    findDrifting
  }) => {
    // Two PRNs share one accreditation partition. `level` sits at watermark 2
    // with no event past it; `drifter` advances the shared partition to slot 5.
    // A naive watermark < partition-max test would wrongly flag `level` (5 > 2);
    // the per-PRN test must not, because slot 5 belongs to `drifter`.
    const ids = buildAccreditationId()
    const level = await prnRepository.create(
      buildAwaitingAcceptancePrn({
        ...underAccreditation(ids),
        lastAppliedEventNumber: 2
      })
    )
    const drifter = await prnRepository.create(
      buildAwaitingAcceptancePrn({
        ...underAccreditation(ids),
        lastAppliedEventNumber: 4
      })
    )
    await ledgerCollection.insertOne(
      buildPrnRejectedEvent({
        ...ids,
        number: 5,
        payload: { prnId: drifter.id, amount: 50 }
      })
    )

    const { total, driftingIds } = await findDrifting()

    const flagged = driftingIds.map((id) => id.toHexString())
    expect(total).toBe(2)
    expect(flagged).toEqual([drifter.id])
    expect(flagged).not.toContain(level.id)
  })
})

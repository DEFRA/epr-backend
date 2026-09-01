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
  buildAwaitingAuthorisationPrn,
  underAccreditation
} from './contract/test-data.js'
import {
  ensureLedgerCollection,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from '#waste-balances/repository/ledger-mongodb.js'
import {
  buildPrnIssuedEvent,
  buildPrnRejectedEvent
} from '#waste-balances/repository/ledger-test-data.js'

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

/**
 * Seeds a PRN stored at `awaiting_acceptance` with the given watermark, then
 * appends a rejection at `eventNumber` the projection has never applied — so the
 * stored status lags the ledger when `eventNumber` sits past the watermark.
 */
const seedRejectedAfter = async (
  prnRepository,
  ledgerCollection,
  { watermark, eventNumber }
) => {
  const ids = buildAccreditationId()
  const created = await prnRepository.create(
    buildAwaitingAcceptancePrn({
      ...underAccreditation(ids),
      lastAppliedEventNumber: watermark
    })
  )
  await ledgerCollection.insertOne(
    buildPrnRejectedEvent({
      ...ids,
      number: eventNumber,
      payload: { prnId: created.id, amount: 50 }
    })
  )
  return { ids, created }
}

describe('createDriftQuery', () => {
  beforeEach(async (/** @type {*} */ { prnCollection, ledgerCollection }) => {
    await prnCollection.deleteMany({})
    await ledgerCollection.deleteMany({})
  })

  it('flags the id of a PRN whose watermark sits behind its own ledger', async (/** @type {*} */ {
    prnRepository,
    ledgerCollection,
    findDrifting
  }) => {
    const { created } = await seedRejectedAfter(
      prnRepository,
      ledgerCollection,
      {
        watermark: 2,
        eventNumber: 3
      }
    )

    const { total, driftingIds } = await findDrifting()

    expect(total).toBe(1)
    expect(driftingIds.map((id) => id.toHexString())).toEqual([created.id])
  })

  it('does not flag a PRN level with its ledger, but still counts it in total', async (/** @type {*} */ {
    prnRepository,
    ledgerCollection,
    findDrifting
  }) => {
    // Event sits at the watermark, not past it — nothing unapplied.
    await seedRejectedAfter(prnRepository, ledgerCollection, {
      watermark: 3,
      eventNumber: 3
    })

    const { total, driftingIds } = await findDrifting()

    expect(total).toBe(1)
    expect(driftingIds).toEqual([])
  })

  it('flags a PRN that carries no watermark once an event exists for it', async (/** @type {*} */ {
    prnRepository,
    ledgerCollection,
    findDrifting
  }) => {
    const ids = buildAccreditationId()
    const created = await prnRepository.create(
      buildAwaitingAuthorisationPrn(underAccreditation(ids))
    )
    await ledgerCollection.insertOne(
      buildPrnIssuedEvent({
        ...ids,
        number: 1,
        payload: { prnId: created.id, amount: 50 }
      })
    )

    const { driftingIds } = await findDrifting()

    expect(driftingIds.map((id) => id.toHexString())).toEqual([created.id])
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

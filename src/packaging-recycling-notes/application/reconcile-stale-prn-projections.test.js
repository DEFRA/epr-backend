import { describe, beforeEach, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import Boom from '@hapi/boom'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  createPackagingRecyclingNotesRepository,
  COLLECTION_NAME as PACKAGING_RECYCLING_NOTES_COLLECTION_NAME
} from '#packaging-recycling-notes/repository/mongodb.js'
import { PRN_VERSION_CONFLICT } from '#packaging-recycling-notes/repository/port.js'
import {
  buildAccreditationId,
  buildAwaitingAcceptancePrn,
  buildAwaitingAuthorisationPrn,
  buildCancelledPrn,
  underAccreditation
} from '#packaging-recycling-notes/repository/contract/test-data.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import {
  createMongoLedgerRepository,
  ensureLedgerCollection,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from '#waste-balances/repository/ledger-mongodb.js'
import {
  buildPrnCancelledAfterIssueEvent,
  buildPrnCreatedEvent,
  buildPrnIssuedEvent,
  buildPrnRejectedEvent
} from '#waste-balances/repository/ledger-test-data.js'

import { createDriftQuery } from '#packaging-recycling-notes/repository/drift-query.mongodb.js'

import { reconcileStalePrnProjections } from './reconcile-stale-prn-projections.js'

const DATABASE_NAME = 'epr-backend'

/**
 * @typedef {import('#common/helpers/logging/logger.js').TypedLogger} TypedLogger
 */

/** A complete TypedLogger stub — the reconciler paths under test log nothing. */
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

  service: async (/** @type {*} */ { database }, use) => {
    const ledgerFactory = await createMongoLedgerRepository(database)
    await use(createWasteBalanceService(ledgerFactory()))
  },

  findDrifting: async (/** @type {*} */ { database }, use) => {
    await use(createDriftQuery(database))
  }
})

/**
 * Seeds a PRN stored at `awaiting_acceptance` with watermark 2, then appends a
 * rejection at slot 3 the projection has never applied — so the stored status
 * lags the ledger. Returns the created (read-shaped) PRN.
 */
const seedDriftingPrn = async (prnRepository, ledgerCollection) => {
  const ids = buildAccreditationId()
  const created = await prnRepository.create(
    buildAwaitingAcceptancePrn({
      ...underAccreditation(ids),
      lastAppliedEventNumber: 2
    })
  )
  await ledgerCollection.insertOne(
    buildPrnRejectedEvent({
      ...ids,
      number: 3,
      payload: { prnId: created.id, amount: 50 }
    })
  )
  return created
}

/**
 * Seeds a benign watermark-behind PRN in the real production shape: stored at
 * `cancelled` with NO watermark, so the catch-up replays the whole lifecycle
 * (created, issued, cancelled). The fold lands back on `cancelled`, so the
 * status is already correct and only the watermark lags — the backfill
 * population option A retires. Returns the created PRN.
 */
const seedBenignDriftingPrn = async (prnRepository, ledgerCollection) => {
  const ids = buildAccreditationId()
  const created = await prnRepository.create(
    buildCancelledPrn(underAccreditation(ids))
  )
  await ledgerCollection.insertMany([
    buildPrnCreatedEvent({
      ...ids,
      number: 1,
      payload: { prnId: created.id, amount: 50 }
    }),
    buildPrnIssuedEvent({
      ...ids,
      number: 2,
      payload: { prnId: created.id, amount: 50 }
    }),
    buildPrnCancelledAfterIssueEvent({
      ...ids,
      number: 3,
      payload: { prnId: created.id, amount: 50 }
    })
  ])
  return created
}

const findStored = (prnCollection, id) =>
  prnCollection.findOne({ _id: ObjectId.createFromHexString(id) })

describe('reconcileStalePrnProjections', () => {
  beforeEach(async (/** @type {*} */ { prnCollection, ledgerCollection }) => {
    await prnCollection.deleteMany({})
    await ledgerCollection.deleteMany({})
  })

  it('reports a PRN whose watermark sits behind the ledger, and writes nothing in dry-run', async (/** @type {*} */ {
    prnCollection,
    ledgerCollection,
    prnRepository,
    service,
    findDrifting
  }) => {
    const created = await seedDriftingPrn(prnRepository, ledgerCollection)

    const result = await reconcileStalePrnProjections(
      { findDrifting, prnCollection, prnRepository, service },
      { isDryRun: true }
    )

    expect(result.total).toBe(1)
    expect(result.drifting).toBe(1)
    expect(result.repaired).toBe(0)
    expect(result.stillDrifting).toBe(0)
    expect(result.reports).toEqual([
      {
        prnId: created.id,
        prnNumber: created.prnNumber,
        currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        lastAppliedEventNumber: 2,
        unappliedCount: 1,
        minUnappliedNumber: 3,
        wouldBecomeStatus: PRN_STATUS.AWAITING_CANCELLATION
      }
    ])

    const stored = await findStored(prnCollection, created.id)
    expect(stored.version).toBe(1)
    expect(stored.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
    expect(stored.lastAppliedEventNumber).toBe(2)
  })

  it('scans but does not flag a projection whose watermark is level with the ledger', async (/** @type {*} */ {
    prnCollection,
    ledgerCollection,
    prnRepository,
    service,
    findDrifting
  }) => {
    const ids = buildAccreditationId()
    const created = await prnRepository.create(
      buildAwaitingAcceptancePrn({
        ...underAccreditation(ids),
        lastAppliedEventNumber: 3
      })
    )
    // The event sits at the watermark, not past it — nothing to apply.
    await ledgerCollection.insertOne(
      buildPrnRejectedEvent({
        ...ids,
        number: 3,
        payload: { prnId: created.id, amount: 50 }
      })
    )

    const result = await reconcileStalePrnProjections(
      { findDrifting, prnCollection, prnRepository, service },
      { isDryRun: true }
    )

    expect(result).toMatchObject({ total: 1, drifting: 0 })
    expect(result.reports).toEqual([])
  })

  it('skips a PRN flagged as drifting but deleted before its read', async (/** @type {*} */ {
    prnRepository,
    service
  }) => {
    const missingId = new ObjectId()
    // Detection flags an id; by the point read the document is gone. Benign, not
    // a failure: it is skipped and counts towards nothing. `findDrifting` is
    // stubbed here because a delete landing in that window cannot be produced
    // reliably against real Mongo.
    const findDrifting = async () => ({ total: 1, driftingIds: [missingId] })
    const prnCollection = /** @type {*} */ ({ findOne: async () => null })

    const result = await reconcileStalePrnProjections(
      { findDrifting, prnCollection, prnRepository, service },
      { isDryRun: true }
    )

    expect(result).toMatchObject({
      total: 1,
      drifting: 0,
      repaired: 0,
      stillDrifting: 0,
      failed: 0
    })
    expect(result.reports).toEqual([])
  })

  it('skips a PRN flagged as drifting but level by the time it is read', async (/** @type {*} */ {
    prnCollection,
    ledgerCollection,
    prnRepository,
    service
  }) => {
    // Detection flags an id; between then and the point read the PRN catches up
    // (a concurrent write advances its watermark), so nothing is left to apply.
    // A benign skip, counted towards nothing. `findDrifting` is stubbed to flag
    // the level PRN because that heal-in-window race cannot be produced reliably
    // against real Mongo; the read and catch-up below run for real.
    const ids = buildAccreditationId()
    const created = await prnRepository.create(
      buildAwaitingAcceptancePrn({
        ...underAccreditation(ids),
        lastAppliedEventNumber: 3
      })
    )
    await ledgerCollection.insertOne(
      buildPrnRejectedEvent({
        ...ids,
        number: 3,
        payload: { prnId: created.id, amount: 50 }
      })
    )
    const findDrifting = async () => ({
      total: 1,
      driftingIds: [ObjectId.createFromHexString(created.id)]
    })

    const result = await reconcileStalePrnProjections(
      { findDrifting, prnCollection, prnRepository, service },
      { isDryRun: false }
    )

    expect(result).toMatchObject({
      total: 1,
      drifting: 0,
      repaired: 0,
      stillDrifting: 0,
      failed: 0
    })
    expect(result.reports).toEqual([])
  })

  it('isolates a malformed document and still reconciles the rest', async (/** @type {*} */ {
    prnCollection,
    ledgerCollection,
    prnRepository,
    service,
    findDrifting
  }) => {
    // A document with the join keys and an unapplied event is flagged as
    // drifting, but fails the read schema. It must fail only itself, not abort
    // the sweep over the good PRN alongside it.
    const badIds = buildAccreditationId()
    const { insertedId } = await prnCollection.insertOne(
      /** @type {*} */ ({
        registrationId: badIds.registrationId,
        accreditation: { id: badIds.accreditationId },
        notAValidPrn: true
      })
    )
    await ledgerCollection.insertOne(
      buildPrnRejectedEvent({
        ...badIds,
        number: 3,
        payload: { prnId: insertedId.toHexString(), amount: 50 }
      })
    )
    const created = await seedDriftingPrn(prnRepository, ledgerCollection)

    const result = await reconcileStalePrnProjections(
      { findDrifting, prnCollection, prnRepository, service },
      { isDryRun: true }
    )

    expect(result).toMatchObject({ total: 2, drifting: 1, failed: 1 })
    expect(
      result.reports.map((/** @type {*} */ report) => report.prnId)
    ).toEqual([created.id])
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0].prnId).toBe(insertedId.toHexString())
    expect(result.failures[0].error).toBeTypeOf('string')
  })

  it('leaves a current projection untouched in repair mode', async (/** @type {*} */ {
    prnCollection,
    ledgerCollection,
    prnRepository,
    service,
    findDrifting
  }) => {
    const ids = buildAccreditationId()
    const created = await prnRepository.create(
      buildAwaitingAcceptancePrn({
        ...underAccreditation(ids),
        lastAppliedEventNumber: 3
      })
    )
    // The event sits at the watermark, not past it — nothing to apply.
    await ledgerCollection.insertOne(
      buildPrnRejectedEvent({
        ...ids,
        number: 3,
        payload: { prnId: created.id, amount: 50 }
      })
    )

    const result = await reconcileStalePrnProjections(
      { findDrifting, prnCollection, prnRepository, service },
      { isDryRun: false }
    )

    expect(result).toMatchObject({
      total: 1,
      drifting: 0,
      repaired: 0,
      stillDrifting: 0
    })
    const stored = await findStored(prnCollection, created.id)
    expect(stored.version).toBe(1)
    expect(stored.status.currentStatus).toBe(PRN_STATUS.AWAITING_ACCEPTANCE)
  })

  it('folds and persists a drifting projection when not a dry run', async (/** @type {*} */ {
    prnCollection,
    ledgerCollection,
    prnRepository,
    service,
    findDrifting
  }) => {
    const created = await seedDriftingPrn(prnRepository, ledgerCollection)

    const result = await reconcileStalePrnProjections(
      { findDrifting, prnCollection, prnRepository, service },
      { isDryRun: false }
    )

    expect(result).toMatchObject({
      total: 1,
      drifting: 1,
      repaired: 1,
      folded: 1,
      stamped: 0,
      stillDrifting: 0
    })

    const stored = await findStored(prnCollection, created.id)
    expect(stored.version).toBe(2)
    expect(stored.status.currentStatus).toBe(PRN_STATUS.AWAITING_CANCELLATION)
    expect(stored.lastAppliedEventNumber).toBe(3)
    expect(stored.status.rejected).toBeDefined()
  })

  it('stamps only the watermark for benign drift, leaving status and history untouched', async (/** @type {*} */ {
    prnCollection,
    ledgerCollection,
    prnRepository,
    service,
    findDrifting
  }) => {
    const created = await seedBenignDriftingPrn(prnRepository, ledgerCollection)
    const before = await findStored(prnCollection, created.id)

    const result = await reconcileStalePrnProjections(
      { findDrifting, prnCollection, prnRepository, service },
      { isDryRun: false }
    )

    expect(result).toMatchObject({
      total: 1,
      drifting: 1,
      repaired: 1,
      folded: 0,
      stamped: 1,
      stillDrifting: 0,
      failed: 0
    })
    // The fold would have replayed the whole lifecycle (no watermark), which is
    // exactly the case a full fold would have duplicated a five-entry history.
    expect(result.reports[0].unappliedCount).toBe(3)

    const after = await findStored(prnCollection, created.id)
    // The watermark advanced to the latest event and the CAS bumped the version.
    expect(after.lastAppliedEventNumber).toBe(3)
    expect(after.version).toBe(before.version + 1)
    // Nothing else moved: no fold, so the status subtree, history and audit
    // fields are byte-identical to the stored document.
    expect(after.status).toEqual(before.status)
    expect(after.updatedAt).toEqual(before.updatedAt)
    expect(after.updatedBy).toEqual(before.updatedBy)

    // And it no longer lags the ledger, so it leaves the sweep for good.
    const { driftingIds } = await findDrifting()
    expect(driftingIds).toEqual([])
  })

  it('reports benign drift in dry-run without writing', async (/** @type {*} */ {
    prnCollection,
    ledgerCollection,
    prnRepository,
    service,
    findDrifting
  }) => {
    const created = await seedBenignDriftingPrn(prnRepository, ledgerCollection)
    const before = await findStored(prnCollection, created.id)

    const result = await reconcileStalePrnProjections(
      { findDrifting, prnCollection, prnRepository, service },
      { isDryRun: true }
    )

    // Option A keeps detection semantics: the benign PRN is still surfaced, its
    // report marking it benign by folding to the status it already carries.
    expect(result).toMatchObject({ total: 1, drifting: 1, repaired: 0 })
    expect(result.reports).toEqual([
      {
        prnId: created.id,
        prnNumber: created.prnNumber,
        currentStatus: PRN_STATUS.CANCELLED,
        lastAppliedEventNumber: undefined,
        unappliedCount: 3,
        minUnappliedNumber: 1,
        wouldBecomeStatus: PRN_STATUS.CANCELLED
      }
    ])

    const after = await findStored(prnCollection, created.id)
    expect(after.version).toBe(before.version)
    expect(after.lastAppliedEventNumber).toBeUndefined()
  })

  it('repairs the rest and counts the losers when a persist loses its race', async (/** @type {*} */ {
    prnCollection,
    ledgerCollection,
    prnRepository,
    service,
    findDrifting
  }) => {
    const throwing = await seedDriftingPrn(prnRepository, ledgerCollection)
    const nulling = await seedDriftingPrn(prnRepository, ledgerCollection)
    const winning = await seedDriftingPrn(prnRepository, ledgerCollection)

    // A CAS miss surfaces two ways: the mongo repo returns null when the stored
    // version has moved; a watermark regression throws. Both leave drift.
    const guardedRepository = {
      ...prnRepository,
      persistProjection: async (/** @type {*} */ params) => {
        if (params.projection.id === throwing.id) {
          throw Boom.conflict('Version conflict', {
            kind: PRN_VERSION_CONFLICT
          })
        }
        if (params.projection.id === nulling.id) {
          return null
        }
        return prnRepository.persistProjection(params)
      }
    }

    const result = await reconcileStalePrnProjections(
      {
        findDrifting,
        prnCollection,
        prnRepository: guardedRepository,
        service
      },
      { isDryRun: false }
    )

    expect(result).toMatchObject({
      total: 3,
      drifting: 3,
      repaired: 1,
      folded: 1,
      stamped: 0,
      stillDrifting: 2
    })

    const storedWinner = await findStored(prnCollection, winning.id)
    expect(storedWinner.version).toBe(2)
    for (const loser of [throwing, nulling]) {
      const stored = await findStored(prnCollection, loser.id)
      expect(stored.version).toBe(1)
    }
  })

  it('surfaces an unexpected repair error as a failure, not still-drifting', async (/** @type {*} */ {
    prnCollection,
    ledgerCollection,
    prnRepository,
    service,
    findDrifting
  }) => {
    const created = await seedDriftingPrn(prnRepository, ledgerCollection)
    // A non-Boom error is not a guard rejection the repository has logged, so it
    // must not masquerade as a benign still-drifting outcome: it fails the PRN.
    const erroringRepository = {
      ...prnRepository,
      persistProjection: async () => {
        throw new Error('connection reset')
      }
    }

    const result = await reconcileStalePrnProjections(
      {
        findDrifting,
        prnCollection,
        prnRepository: erroringRepository,
        service
      },
      { isDryRun: false }
    )

    expect(result).toMatchObject({
      drifting: 0,
      repaired: 0,
      stillDrifting: 0,
      failed: 1
    })
    expect(result.failures).toEqual([
      { prnId: created.id, error: 'Error: connection reset' }
    ])
  })

  it('folds a projection that has applied no events, reporting a null PRN number', async (/** @type {*} */ {
    prnCollection,
    ledgerCollection,
    prnRepository,
    service,
    findDrifting
  }) => {
    const ids = buildAccreditationId()
    // Awaiting authorisation: created but never issued, so it carries no PRN
    // number and no watermark. An issuance it never applied leaves it adrift.
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

    const result = await reconcileStalePrnProjections(
      { findDrifting, prnCollection, prnRepository, service },
      { isDryRun: true }
    )

    expect(result).toMatchObject({ total: 1, drifting: 1 })
    expect(result.reports).toEqual([
      {
        prnId: created.id,
        prnNumber: null,
        currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        lastAppliedEventNumber: undefined,
        unappliedCount: 1,
        minUnappliedNumber: 1,
        wouldBecomeStatus: PRN_STATUS.AWAITING_ACCEPTANCE
      }
    ])
  })
})

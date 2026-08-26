import { describe, beforeEach, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'

import { updatePrnStatus } from './update-status.js'
import {
  PRN_STATUS,
  PRN_ACTOR,
  StatusConflictError
} from '#packaging-recycling-notes/domain/model.js'
import { createPackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/mongodb.js'
import { buildAwaitingAcceptancePrn } from '#packaging-recycling-notes/repository/contract/test-data.js'
import {
  createMongoLedgerRepository,
  ensureLedgerCollection,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from '#waste-balances/repository/ledger-mongodb.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { LedgerSlotConflictError } from '#waste-balances/repository/ledger-port.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { createMockLogger } from '#test/mock-logger.js'

const DATABASE_NAME = 'epr-backend'
const PRNS_COLLECTION = 'packaging-recycling-notes'

const ORG_ID = 'org-concurrency'
const REG_ID = 'reg-concurrency'
const ACC_ID = 'acc-concurrency'
const TONNAGE = 5
const OPENING = 386.62

const ACCEPTOR = { id: 'user-acceptor', name: 'Acceptor User' }

/**
 * The PRN the ledger seed reflects: issued, then accepted. Acceptance is
 * layered onto the issued builder so the document is a real accepted PRN, with
 * the history and business operations that go with it, rather than an issued
 * one with its current status rewritten.
 *
 * @param {Partial<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>} overrides
 * @returns {Omit<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote, 'id'>}
 */
const buildAcceptedPrn = (overrides) => {
  const issued = buildAwaitingAcceptancePrn(overrides)
  const acceptedAt = new Date()
  return {
    ...issued,
    status: {
      ...issued.status,
      currentStatus: PRN_STATUS.ACCEPTED,
      currentStatusAt: acceptedAt,
      accepted: { at: acceptedAt, by: ACCEPTOR },
      history: [
        ...issued.status.history,
        { status: PRN_STATUS.ACCEPTED, at: acceptedAt, by: ACCEPTOR }
      ]
    }
  }
}

const it = mongoIt.extend({
  mongoClient: async (/** @type {*} */ { db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  }
})

const deferred = () => {
  /** @type {() => void} */
  let settle = () => undefined
  const promise = new Promise((resolve) => {
    settle = () => resolve(undefined)
  })
  return { promise, settle }
}

/**
 * Forwards every property but the one named, so a proxy only has to describe
 * what it changes.
 *
 * @template T
 * @param {T} target
 * @param {string | symbol} property
 */
const passThrough = (target, property) => {
  const value = Reflect.get(/** @type {object} */ (target), property)
  return typeof value === 'function' ? value.bind(target) : value
}

/**
 * A view of a real database whose PRN projection write waits for `release`
 * before reaching mongod, and which announces when a writer has got that far.
 *
 * This is the window the defect lives in: the ledger event is committed and the
 * document that projects it is not, so a second request folding in between sees
 * a head that has moved and a document that has not.
 *
 * @param {import('mongodb').Db} database
 * @param {Promise<unknown>} release
 */
const databaseHoldingProjectionWrite = (database, release) => {
  const reached = deferred()

  /**
   * @param {import('mongodb').Collection} collection
   */
  const collectionHoldingReplace = (collection) => {
    const findOneAndReplace = collection.findOneAndReplace.bind(collection)
    return new Proxy(collection, {
      get: (target, property) =>
        property === 'findOneAndReplace'
          ? async (
              /** @type {Parameters<typeof findOneAndReplace>} */ ...args
            ) => {
              reached.settle()
              await release
              return findOneAndReplace(...args)
            }
          : passThrough(target, property)
    })
  }

  const view = new Proxy(database, {
    get: (target, property) =>
      property === 'collection'
        ? (/** @type {string} */ name) =>
            name === PRNS_COLLECTION
              ? collectionHoldingReplace(target.collection(name))
              : target.collection(name)
        : passThrough(target, property)
  })

  return { view, reachedProjectionWrite: reached.promise }
}

describe('PRN status concurrency against real MongoDB', () => {
  /** @type {import('mongodb').Db} */
  let database
  let prnRepositoryFactory
  let ledgerRepository
  let prnId

  beforeEach(async (/** @type {*} */ { mongoClient }) => {
    database = mongoClient.db(DATABASE_NAME)
    await database.collection(PRNS_COLLECTION).deleteMany({})
    await database
      .collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
      .deleteMany({})
    await ensureLedgerCollection(database)

    prnRepositoryFactory = await createPackagingRecyclingNotesRepository(
      database,
      []
    )
    ledgerRepository = (await createMongoLedgerRepository(database))()

    // The accreditation's balance already reflects this PRN's issuance and
    // acceptance, so cancelling it credits the tonnage back exactly once.
    await ledgerRepository.appendEvents([
      buildLedgerEvent({
        organisationId: ORG_ID,
        registrationId: REG_ID,
        accreditationId: ACC_ID,
        number: 1,
        kind: LEDGER_EVENT_KIND.PRN_ACCEPTED,
        payload: { prnId: 'seed', amount: TONNAGE },
        closingBalance: { amount: OPENING, availableAmount: OPENING }
      })
    ])

    const { id } = await prnRepositoryFactory(createMockLogger()).create(
      buildAcceptedPrn({
        organisation: { id: ORG_ID, name: 'Test Reprocessor' },
        registrationId: REG_ID,
        accreditation: {
          id: ACC_ID,
          accreditationNumber: 'ACC-1',
          accreditationYear: 2026,
          material: 'plastic',
          submittedToRegulator: 'ea',
          siteAddress: { line1: '1 Test Street', postcode: 'SW1A 1AA' }
        },
        tonnage: TONNAGE
      })
    )
    prnId = id
  })

  const cancel = (repositoryFactory) =>
    updatePrnStatus({
      prnRepository: repositoryFactory(createMockLogger()),
      ledgerRepository,
      organisationsRepository: /** @type {*} */ ({}),
      prnEvents: { onCancelled: vi.fn().mockResolvedValue(undefined) },
      logger: createMockLogger(),
      id: prnId,
      organisationId: ORG_ID,
      registrationId: REG_ID,
      accreditationId: ACC_ID,
      newStatus: PRN_STATUS.CANCELLED,
      actor: PRN_ACTOR.SERVICE_MAINTAINER,
      user: { id: 'admin-1', name: 'Admin User' }
    })

  const cancellationEvents = async () => {
    const all = await ledgerRepository.findAllInLedger({
      organisationId: ORG_ID,
      registrationId: REG_ID,
      accreditationId: ACC_ID
    })
    return all.filter(
      (event) => event.kind === LEDGER_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE
    )
  }

  it('credits the balance once when a second cancellation folds after the first has appended', async () => {
    const release = deferred()
    const { view, reachedProjectionWrite } = databaseHoldingProjectionWrite(
      database,
      release.promise
    )
    const heldFactory = await createPackagingRecyclingNotesRepository(view, [])

    // The first cancellation commits its ledger event and is held before it can
    // write the document that projects it.
    const first = cancel(heldFactory)
    await reachedProjectionWrite

    // The second folds at the moved head while the document still reads
    // accepted. The ticket's mechanism: every guard the old code applied was
    // satisfied here, and it appended a second credit at the next free slot.
    await expect(cancel(prnRepositoryFactory)).rejects.toBeInstanceOf(
      StatusConflictError
    )

    release.settle()
    await first

    expect(await cancellationEvents()).toHaveLength(1)
    const balance = await ledgerRepository.findLatestInLedger({
      organisationId: ORG_ID,
      registrationId: REG_ID,
      accreditationId: ACC_ID
    })
    expect(balance?.closingBalance).toEqual({
      amount: OPENING + TONNAGE,
      availableAmount: OPENING + TONNAGE
    })
  })

  it('credits the balance once when two cancellations contend for the same slot', async () => {
    const results = await Promise.allSettled([
      cancel(prnRepositoryFactory),
      cancel(prnRepositoryFactory)
    ])

    // Which conflict the refused cancellation gets depends on where its fold
    // landed relative to the other's append, and real network latency makes that
    // genuinely variable. Both outcomes are refusals, and both leave one credit.
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect(
      rejected[0].reason instanceof LedgerSlotConflictError ||
        rejected[0].reason instanceof StatusConflictError
    ).toBe(true)

    expect(await cancellationEvents()).toHaveLength(1)
  })
})

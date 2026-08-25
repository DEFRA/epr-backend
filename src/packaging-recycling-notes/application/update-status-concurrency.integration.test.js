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
 * A view of a real database whose PRN projection write waits for `release`
 * before reaching mongod, and which announces when a writer has got that far.
 *
 * This is the window the defect lives in: the ledger event is committed and the
 * document that projects it is not, so a second request folding in between sees
 * a head that has moved and a document that has not.
 *
 * @param {*} database
 * @param {Promise<unknown>} release
 */
const databaseHoldingProjectionWrite = (database, release) => {
  const reached = deferred()

  const view = {
    collection: (/** @type {string} */ name) =>
      new Proxy(database.collection(name), {
        get: (target, property) => {
          if (property === 'findOneAndReplace' && name === PRNS_COLLECTION) {
            return async (/** @type {*[]} */ ...args) => {
              reached.settle()
              await release
              return target.findOneAndReplace(...args)
            }
          }
          const value = Reflect.get(target, property)
          return typeof value === 'function' ? value.bind(target) : value
        }
      })
  }

  return { view, reachedProjectionWrite: reached.promise }
}

describe('PRN status concurrency against real MongoDB', () => {
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
      buildAwaitingAcceptancePrn({
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
        tonnage: TONNAGE,
        status: { currentStatus: PRN_STATUS.ACCEPTED }
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

    // Which conflict the loser gets depends on where its fold landed relative
    // to the winner's append, and real network latency makes that genuinely
    // variable. Both outcomes are refusals, and both leave one credit.
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect(
      rejected[0].reason instanceof LedgerSlotConflictError ||
        rejected[0].reason instanceof StatusConflictError
    ).toBe(true)

    expect(await cancellationEvents()).toHaveLength(1)
  })
})

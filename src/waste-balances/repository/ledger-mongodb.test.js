import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'

import {
  createMongoLedgerRepository,
  ensureLedgerCollection,
  WASTE_BALANCE_EVENTS_COLLECTION_NAME
} from './ledger-mongodb.js'
import { LedgerSlotConflictError } from './ledger-port.js'
import { buildLedgerEvent } from './ledger-test-data.js'
import { testLedgerRepositoryContract } from './ledger-port.contract.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async (/** @type {*} */ { db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  ledgerCollection: async (/** @type {*} */ { mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await ensureLedgerCollection(database)
    await use(database.collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME))
  },

  ledgerRepository: async (/** @type {*} */ { mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await database
      .collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
      .deleteMany({})
    const factory = await createMongoLedgerRepository(database)
    await use(factory)
  }
})

/**
 * A view of a real database whose `insertMany` waits for `release` before
 * reaching mongod, and which announces when a writer has got that far. Lets a
 * test place two writers past the slot pre-check before either one inserts.
 */
const databaseHoldingInsert = (/** @type {*} */ database, release) => {
  /** @type {() => void} */
  let announce
  const reachedInsert = new Promise((resolve) => {
    announce = resolve
  })

  const view = {
    collection: (/** @type {string} */ name) =>
      new Proxy(database.collection(name), {
        get: (target, property) => {
          if (property === 'insertMany') {
            return async (/** @type {*[]} */ ...args) => {
              announce()
              await release
              return target.insertMany(...args)
            }
          }
          const value = Reflect.get(target, property)
          return typeof value === 'function' ? value.bind(target) : value
        }
      })
  }

  return { view, reachedInsert }
}

const indexKeyFor = (indexes, name) =>
  indexes.find((idx) => idx.name === name)?.key

const indexOptionFor = (indexes, name, option) =>
  indexes.find((idx) => idx.name === name)?.[option]

describe('ensureLedgerCollection', () => {
  beforeEach(async (/** @type {*} */ { mongoClient }) => {
    await mongoClient
      .db(DATABASE_NAME)
      .collection(WASTE_BALANCE_EVENTS_COLLECTION_NAME)
      .deleteMany({})
  })

  describe('indexes', () => {
    it('creates the partition_number compound unique index', async (/** @type {*} */ {
      ledgerCollection
    }) => {
      const indexes = await ledgerCollection.indexes()
      expect(indexKeyFor(indexes, 'partition_number')).toEqual({
        registrationId: 1,
        accreditationId: 1,
        number: 1
      })
      expect(indexOptionFor(indexes, 'partition_number', 'unique')).toBe(true)
    })

    it('creates the partition_kind_latest index for findLatestInLedgerByKind', async (/** @type {*} */ {
      ledgerCollection
    }) => {
      const indexes = await ledgerCollection.indexes()
      expect(indexKeyFor(indexes, 'partition_kind_latest')).toEqual({
        registrationId: 1,
        accreditationId: 1,
        kind: 1,
        number: -1
      })
    })

    it('creates the prn_watermark_catchup index for findEventsByPrnIdAfter', async (/** @type {*} */ {
      ledgerCollection
    }) => {
      const indexes = await ledgerCollection.indexes()
      expect(indexKeyFor(indexes, 'prn_watermark_catchup')).toEqual({
        registrationId: 1,
        accreditationId: 1,
        'payload.prnId': 1,
        number: 1
      })
    })
  })

  describe('idempotency', () => {
    it('is safe to call multiple times', async (/** @type {*} */ {
      mongoClient
    }) => {
      const database = mongoClient.db(DATABASE_NAME)
      await ensureLedgerCollection(database)
      await expect(ensureLedgerCollection(database)).resolves.toBeDefined()
    })
  })
})

describe('MongoDB ledger repository', () => {
  it('exposes the ledger port surface', async (/** @type {*} */ {
    mongoClient
  }) => {
    const database = mongoClient.db(DATABASE_NAME)
    const repository = (await createMongoLedgerRepository(database))()
    expect(repository.appendEvents).toBeTypeOf('function')
    expect(repository.findLatestInLedger).toBeTypeOf('function')
    expect(repository.findLatestInLedgerByKind).toBeTypeOf('function')
    expect(repository.findEventsByPrnIdAfter).toBeTypeOf('function')
    expect(repository.findAllInLedger).toBeTypeOf('function')
  })

  describe('ledger repository contract', () => {
    testLedgerRepositoryContract(it)
  })

  describe('appendEvents error translation', () => {
    it('rethrows non-conflict MongoDB errors unchanged', async () => {
      const upstream = new Error('connection lost')
      const stubCollection = {
        createIndex: () => Promise.resolve(),
        findOne: () => Promise.resolve(null),
        insertMany: () => Promise.reject(upstream)
      }
      const stubDb = { collection: () => stubCollection }

      const repository = (
        await createMongoLedgerRepository(/** @type {*} */ (stubDb))
      )()

      await expect(
        repository.appendEvents([buildLedgerEvent({ number: 1 })])
      ).rejects.toBe(upstream)
    })

    it('classifies the loser of a race for the same slot as a slot conflict', async (/** @type {*} */ {
      mongoClient
    }) => {
      const database = mongoClient.db(DATABASE_NAME)
      const collection = database.collection(
        WASTE_BALANCE_EVENTS_COLLECTION_NAME
      )
      await collection.deleteMany({})

      /** @type {() => void} */
      let releaseLoserInsert
      const released = new Promise((resolve) => {
        releaseLoserInsert = resolve
      })
      const { view, reachedInsert } = databaseHoldingInsert(database, released)

      const winner = (await createMongoLedgerRepository(database))()
      const loser = (
        await createMongoLedgerRepository(/** @type {*} */ (view))
      )()

      // Hold the loser between its slot pre-check and its insert. Both writers
      // then find slot 1 free and claim it, and only the unique index can
      // separate them — which is the collision the pre-check cannot see.
      const contestedSlot = buildLedgerEvent({ number: 1 })
      const losingAppend = loser.appendEvents([contestedSlot])
      await reachedInsert
      await winner.appendEvents([contestedSlot])
      releaseLoserInsert()

      const reason = await losingAppend.catch(
        (/** @type {*} */ caught) => caught
      )
      expect(reason).toBeInstanceOf(LedgerSlotConflictError)
      expect(reason).toMatchObject({
        registrationId: contestedSlot.registrationId,
        accreditationId: contestedSlot.accreditationId,
        slotNumber: contestedSlot.number
      })

      await expect(collection.countDocuments()).resolves.toBe(1)
    })
  })
})

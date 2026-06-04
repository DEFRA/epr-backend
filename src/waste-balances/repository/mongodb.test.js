import { describe, beforeEach, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { logger } from '#common/helpers/logging/logger.js'
import { createWasteBalancesRepository, saveBalance } from './mongodb.js'
import { createMongoStreamRepository } from './stream-mongodb.js'
import { testWasteBalancesRepositoryContract } from './port.contract.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '../domain/model.js'

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn()
  }
}))

const DATABASE_NAME = 'epr-backend'
const WASTE_BALANCE_COLLECTION_NAME = 'waste-balances'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(
      // db is typed as the fixture tuple by TypeScript; the yielded value is a string (mongo URI)
      /** @type {string} */ (/** @type {unknown} */ (db))
    )
    await use(client)
    await client.close()
  },

  streamRepository: async (
    // @ts-expect-error -- vitest .extend() fixture typing
    { mongoClient },
    use
  ) => {
    const database = /** @type {import('mongodb').MongoClient} */ (
      mongoClient
    ).db(DATABASE_NAME)
    const factory = await createMongoStreamRepository(database)
    await use(factory())
  },

  wasteBalancesRepository: async (
    // @ts-expect-error -- vitest .extend() fixture typing
    { mongoClient, streamRepository },
    use
  ) => {
    const database = /** @type {import('mongodb').MongoClient} */ (
      mongoClient
    ).db(DATABASE_NAME)
    const factory = await createWasteBalancesRepository(database, {
      streamRepository:
        /** @type {import('./stream-port.js').WasteBalanceStreamRepository} */ (
          /** @type {unknown} */ (streamRepository)
        )
    })
    await use(factory)
  },

  insertWasteBalance: async (
    // @ts-expect-error -- vitest .extend() fixture typing
    { mongoClient },
    use
  ) => {
    await use(async (wasteBalance) => {
      await /** @type {import('mongodb').MongoClient} */ (mongoClient)
        .db(DATABASE_NAME)
        .collection(WASTE_BALANCE_COLLECTION_NAME)
        .insertOne(wasteBalance)
    })
  },

  insertWasteBalances: async (
    // @ts-expect-error -- vitest .extend() fixture typing
    { mongoClient },
    use
  ) => {
    await use(async (wasteBalances) => {
      await /** @type {import('mongodb').MongoClient} */ (mongoClient)
        .db(DATABASE_NAME)
        .collection(WASTE_BALANCE_COLLECTION_NAME)
        .insertMany(wasteBalances)
    })
  }
})

describe('MongoDB waste balances repository', () => {
  describe('repository creation', () => {
    it('should create repository instance', async ({
      mongoClient,
      streamRepository
    }) => {
      const database = /** @type {import('mongodb').MongoClient} */ (
        mongoClient
      ).db(DATABASE_NAME)
      const repository = await createWasteBalancesRepository(database, {
        streamRepository:
          /** @type {import('./stream-port.js').WasteBalanceStreamRepository} */ (
            /** @type {unknown} */ (streamRepository)
          )
      })
      const instance = repository()
      expect(instance).toBeDefined()
      expect(instance.findByAccreditationId).toBeTypeOf('function')
    })
  })

  describe('data management', () => {
    beforeEach(
      async (
        // @ts-expect-error -- vitest .extend() fixture typing
        { mongoClient }
      ) => {
        await /** @type {import('mongodb').MongoClient} */ (mongoClient)
          .db(DATABASE_NAME)
          .collection(WASTE_BALANCE_COLLECTION_NAME)
          .deleteMany({})
      }
    )

    describe('waste balances repository contract', () => {
      testWasteBalancesRepositoryContract(it)
    })
  })

  describe('legacy documents with no canonicalSource marker', () => {
    beforeEach(
      async (
        // @ts-expect-error -- vitest .extend() fixture typing
        { mongoClient }
      ) => {
        await /** @type {import('mongodb').MongoClient} */ (mongoClient)
          .db(DATABASE_NAME)
          .collection(WASTE_BALANCE_COLLECTION_NAME)
          .deleteMany({})
      }
    )

    const buildRepository = async (mongoClient) => {
      const db = /** @type {import('mongodb').MongoClient} */ (mongoClient).db(
        DATABASE_NAME
      )
      const streamRepository = (await createMongoStreamRepository(db))()
      const factory = await createWasteBalancesRepository(db, {
        streamRepository
      })
      return { db, repository: factory() }
    }

    it('flips a document that has no canonicalSource field to migrating — absence reads as embedded', async ({
      mongoClient
    }) => {
      const { db, repository } = await buildRepository(mongoClient)
      await db.collection(WASTE_BALANCE_COLLECTION_NAME).insertOne(
        /** @type {*} */ ({
          _id: '00000000-0000-0000-0000-000000000020',
          accreditationId: 'acc-legacy-unmarked',
          organisationId: 'org-legacy',
          amount: 0,
          availableAmount: 0,
          transactions: [],
          version: 2,
          schemaVersion: 1
        })
      )

      const result = await repository.flipCanonicalSourceToMigrating({
        accreditationId: 'acc-legacy-unmarked',
        capturedVersion: 2
      })

      expect(result).toEqual({
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      })
      const after = await repository.findByAccreditationId('acc-legacy-unmarked')
      expect(after?.canonicalSource).toBe(
        WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      )
      expect(after?.migratingSince).toBeDefined()
    })

    it('leaves a fieldless document untouched when the captured version diverges', async ({
      mongoClient
    }) => {
      const { db, repository } = await buildRepository(mongoClient)
      await db.collection(WASTE_BALANCE_COLLECTION_NAME).insertOne(
        /** @type {*} */ ({
          _id: '00000000-0000-0000-0000-000000000021',
          accreditationId: 'acc-legacy-stale',
          organisationId: 'org-legacy',
          amount: 0,
          availableAmount: 0,
          transactions: [],
          version: 5,
          schemaVersion: 1
        })
      )

      await repository.flipCanonicalSourceToMigrating({
        accreditationId: 'acc-legacy-stale',
        capturedVersion: 4
      })

      const after = await repository.findByAccreditationId('acc-legacy-stale')
      expect(after?.canonicalSource).toBeUndefined()
      expect(after?.migratingSince).toBeUndefined()
    })
  })

  describe('document growth observability', () => {
    beforeEach(
      async (
        // @ts-expect-error -- vitest .extend() fixture typing
        { mongoClient }
      ) => {
        vi.mocked(logger.info).mockClear()
        await /** @type {import('mongodb').MongoClient} */ (mongoClient)
          .db(DATABASE_NAME)
          .collection(WASTE_BALANCE_COLLECTION_NAME)
          .deleteMany({})
      }
    )

    it('emits a growth log line after persisting an embedded balance', async ({
      mongoClient
    }) => {
      const db = /** @type {import('mongodb').MongoClient} */ (mongoClient).db(
        DATABASE_NAME
      )
      /** @type {import('../domain/model.js').WasteBalanceTransaction} */
      const transaction = {
        id: 'txn-1',
        type: 'credit',
        createdAt: '2026-05-14T00:00:00.000Z',
        createdBy: { id: 'user-1', name: 'user-1' },
        amount: 1,
        openingAmount: 0,
        closingAmount: 1,
        openingAvailableAmount: 0,
        closingAvailableAmount: 1,
        entities: []
      }
      /** @type {import('../domain/model.js').WasteBalance} */
      const balance = {
        id: '00000000-0000-0000-0000-000000000010',
        accreditationId: 'acc-growth-1',
        registrationId: 'reg-growth-1',
        organisationId: 'org-growth-1',
        amount: 1,
        availableAmount: 1,
        transactions: [transaction],
        version: 1,
        schemaVersion: 1,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      }

      await saveBalance(db)(balance, [transaction])

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Waste balance document growth')
        })
      )
      const message = vi.mocked(logger.info).mock.calls[0][0].message
      expect(message).toContain('organisationId=org-growth-1')
      expect(message).toContain('accreditationId=acc-growth-1')
      expect(message).toContain('transactionCount=1')
      expect(message).toContain('newTransactionCount=1')
      expect(message).toMatch(/bsonSize=\d+/)
      expect(message).toMatch(/percentOfBsonLimit=[\d.]+/)
    })
  })
})

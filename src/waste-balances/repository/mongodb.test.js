import { describe, beforeEach, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { logger } from '#common/helpers/logging/logger.js'
import { createWasteBalancesRepository, saveBalance } from './mongodb.js'
import {
  createMongoLedgerRepository,
  WASTE_BALANCE_LEDGER_COLLECTION_NAME
} from './ledger-mongodb.js'
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
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  ledgerRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    await database
      .collection(WASTE_BALANCE_LEDGER_COLLECTION_NAME)
      .deleteMany({})
    const factory = await createMongoLedgerRepository(database)
    await use(factory())
  },

  wasteBalancesRepository: async ({ mongoClient, ledgerRepository }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = await createWasteBalancesRepository(database, {
      ledgerRepository
    })
    await use(factory)
  },

  insertWasteBalance: async ({ mongoClient }, use) => {
    await use(async (wasteBalance) => {
      await mongoClient
        .db(DATABASE_NAME)
        .collection(WASTE_BALANCE_COLLECTION_NAME)
        .insertOne(wasteBalance)
    })
  },

  insertWasteBalances: async ({ mongoClient }, use) => {
    await use(async (wasteBalances) => {
      await mongoClient
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
      ledgerRepository
    }) => {
      const database = mongoClient.db(DATABASE_NAME)
      const repository = await createWasteBalancesRepository(database, {
        ledgerRepository
      })
      const instance = repository()
      expect(instance).toBeDefined()
      expect(instance.findByAccreditationId).toBeTypeOf('function')
    })

    it('ensures the ledger collection indexes exist', async ({
      mongoClient,
      ledgerRepository
    }) => {
      const database = mongoClient.db(DATABASE_NAME)
      await createWasteBalancesRepository(database, { ledgerRepository })

      const indexes = await database
        .collection(WASTE_BALANCE_LEDGER_COLLECTION_NAME)
        .indexes()
      const names = indexes.map((idx) => idx.name)
      expect(names).toContain('accreditationId_number')
      expect(names).toContain('summaryLogRow_wasteRecord_findLatest')
    })
  })

  describe('data management', () => {
    beforeEach(async ({ mongoClient }) => {
      await mongoClient
        .db(DATABASE_NAME)
        .collection(WASTE_BALANCE_COLLECTION_NAME)
        .deleteMany({})
    })

    describe('waste balances repository contract', () => {
      testWasteBalancesRepositoryContract(it)
    })
  })

  describe('document growth observability', () => {
    beforeEach(async ({ mongoClient }) => {
      vi.mocked(logger.info).mockClear()
      await mongoClient
        .db(DATABASE_NAME)
        .collection(WASTE_BALANCE_COLLECTION_NAME)
        .deleteMany({})
    })

    it('emits a growth log line after persisting an embedded balance', async ({
      mongoClient
    }) => {
      const db = mongoClient.db(DATABASE_NAME)
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
      const balance = {
        id: '00000000-0000-0000-0000-000000000010',
        accreditationId: 'acc-growth-1',
        organisationId: 'org-1',
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
      expect(message).toContain('accreditationId=acc-growth-1')
      expect(message).toContain('transactionCount=1')
      expect(message).toContain('newTransactionCount=1')
      expect(message).toMatch(/bsonSize=\d+/)
      expect(message).toMatch(/percentOfBsonLimit=[\d.]+/)
    })
  })
})

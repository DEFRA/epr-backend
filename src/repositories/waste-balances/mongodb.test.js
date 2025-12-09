import { describe, beforeEach, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createWasteBalancesRepository } from './mongodb.js'
import { testWasteBalancesRepositoryContract } from './port.contract.js'
import { EXPORTER_FIELD } from '#domain/waste-balances/constants.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

const DATABASE_NAME = 'epr-backend'
const WASTE_BALANCE_COLLECTION_NAME = 'waste-balances'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  // eslint-disable-next-line no-empty-pattern
  organisationsRepository: async ({}, use) => {
    const mock = {
      getAccreditationById: vi.fn()
    }
    await use(mock)
  },

  wasteBalancesRepository: async (
    { mongoClient, organisationsRepository },
    use
  ) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = createWasteBalancesRepository(database, {
      organisationsRepository
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
    it('should create repository instance', async ({ mongoClient }) => {
      const database = mongoClient.db(DATABASE_NAME)
      const repository = createWasteBalancesRepository(database)
      const instance = repository()
      expect(instance).toBeDefined()
      expect(instance.findByAccreditationId).toBeTypeOf('function')
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

    describe('implementation details', () => {
      it('throws if organisationsRepository is missing', async ({
        mongoClient
      }) => {
        const database = mongoClient.db(DATABASE_NAME)
        const repository = createWasteBalancesRepository(database)
        const instance = repository()
        await expect(
          instance.updateWasteBalanceTransactions([], 'acc-1')
        ).rejects.toThrow('organisationsRepository dependency is required')
      })

      it('throws if accreditation is not found', async ({ mongoClient }) => {
        const database = mongoClient.db(DATABASE_NAME)
        const organisationsRepository = {
          getAccreditationById: vi.fn().mockResolvedValue(null)
        }
        const repository = createWasteBalancesRepository(database, {
          organisationsRepository
        })
        const instance = repository()
        await expect(
          instance.updateWasteBalanceTransactions([], 'acc-1')
        ).rejects.toThrow('Accreditation not found: acc-1')
      })

      it('does nothing if no transactions are generated', async ({
        mongoClient
      }) => {
        const database = mongoClient.db(DATABASE_NAME)
        const organisationsRepository = {
          getAccreditationById: vi.fn().mockResolvedValue({
            validFrom: '2023-01-01',
            validTo: '2023-12-31'
          })
        }
        const repository = createWasteBalancesRepository(database, {
          organisationsRepository
        })
        const instance = repository()

        await instance.updateWasteBalanceTransactions([], 'acc-1')

        const count = await database
          .collection(WASTE_BALANCE_COLLECTION_NAME)
          .countDocuments()
        expect(count).toBe(0)
      })

      it('updates existing waste balance', async ({
        mongoClient,
        insertWasteBalance
      }) => {
        const database = mongoClient.db(DATABASE_NAME)
        const organisationsRepository = {
          getAccreditationById: vi.fn().mockResolvedValue({
            validFrom: '2023-01-01',
            validTo: '2023-12-31'
          })
        }
        const repository = createWasteBalancesRepository(database, {
          organisationsRepository
        })
        const instance = repository()

        const accreditationId = 'acc-existing'
        await insertWasteBalance({
          accreditationId,
          amount: 100,
          availableAmount: 100,
          transactions: []
        })

        const record = {
          data: {
            processingType: PROCESSING_TYPES.EXPORTER,
            [EXPORTER_FIELD.PRN_ISSUED]: 'No',
            [EXPORTER_FIELD.DATE_OF_DISPATCH]: '2023-06-01',
            [EXPORTER_FIELD.INTERIM_SITE]: 'No',
            [EXPORTER_FIELD.EXPORT_TONNAGE]: '50'
          }
        }

        await instance.updateWasteBalanceTransactions([record], accreditationId)

        const updated = await database
          .collection(WASTE_BALANCE_COLLECTION_NAME)
          .findOne({ accreditationId })

        expect(updated.amount).toBe(150)
        expect(updated.transactions).toHaveLength(1)
        expect(updated.transactions[0].amount).toBe(50)
      })
    })
  })
})

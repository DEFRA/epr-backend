import Hapi from '@hapi/hapi'
import { describe, beforeEach, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createWasteBalancesRepository } from './mongodb.js'
import { testWasteBalancesRepositoryContract } from './port.contract.js'
import { mongoWasteBalancesRepositoryPlugin } from '#plugins/repositories/mongo-waste-balances-repository-plugin.js'

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
      findAccreditationById: vi.fn()
    }
    await use(mock)
  },

  wasteBalancesRepository: async (
    { mongoClient, organisationsRepository },
    use
  ) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = await createWasteBalancesRepository(database, {
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
      const repository = await createWasteBalancesRepository(database)
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

    describe('plugin wiring', () => {
      it('makes repository available on request via plugin', async ({
        mongoClient
      }) => {
        const server = Hapi.server()

        // Provide db dependency that the plugin expects
        const fakeMongoPlugin = {
          name: 'mongodb',
          register: async (s) => {
            s.decorate('server', 'db', mongoClient.db(DATABASE_NAME))
          }
        }
        await server.register(fakeMongoPlugin)
        await server.register(mongoWasteBalancesRepositoryPlugin)

        server.route({
          method: 'GET',
          path: '/test',
          options: { auth: false },
          handler: async (request) => {
            // Should return null for non-existent accreditation (not throw)
            const balance =
              await request.wasteBalancesRepository.findByAccreditationId(
                'non-existent-accreditation'
              )
            return { found: balance !== null }
          }
        })

        await server.initialize()
        const response = await server.inject({ method: 'GET', url: '/test' })
        const result = JSON.parse(response.payload)

        expect(result.found).toBe(false)
      })
    })
  })
})

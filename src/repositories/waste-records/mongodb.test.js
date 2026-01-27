import Hapi from '@hapi/hapi'
import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createWasteRecordsRepository } from './mongodb.js'
import { testWasteRecordsRepositoryContract } from './port.contract.js'
import {
  buildVersionData,
  toWasteRecordVersions
} from './contract/test-data.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { mongoWasteRecordsRepositoryPlugin } from '#plugins/repositories/mongo-waste-records-repository-plugin.js'

const DATABASE_NAME = 'epr-backend'
const COLLECTION_NAME = 'waste-records'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  wasteRecordsRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = await createWasteRecordsRepository(database)
    await use(factory)
  }
})

describe('MongoDB waste records repository', () => {
  beforeEach(async ({ mongoClient }) => {
    await mongoClient
      .db(DATABASE_NAME)
      .collection(COLLECTION_NAME)
      .deleteMany({})
  })

  describe('waste records repository contract', () => {
    testWasteRecordsRepositoryContract(it)
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
      await server.register(mongoWasteRecordsRepositoryPlugin)

      server.route({
        method: 'POST',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          const organisationId = 'org-123'
          const registrationId = 'reg-456'

          const wasteRecordVersions = toWasteRecordVersions({
            [WASTE_RECORD_TYPE.RECEIVED]: {
              'row-1': buildVersionData()
            }
          })

          await request.wasteRecordsRepository.appendVersions(
            organisationId,
            registrationId,
            wasteRecordVersions
          )

          const found = await request.wasteRecordsRepository.findByRegistration(
            organisationId,
            registrationId
          )
          return { found: found.length }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'POST', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.found).toBe(1)
    })
  })
})

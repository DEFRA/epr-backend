import Hapi from '@hapi/hapi'
import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { createFormSubmissionsRepository } from './mongodb.js'
import { testFormSubmissionsRepositoryContract } from './port.contract.js'
import {
  buildAccreditation,
  buildRegistration,
  buildOrganisation
} from './contract/test-data.js'
import { mongoFormSubmissionsRepositoryPlugin } from './mongodb.plugin.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  formSubmissionsRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = await createFormSubmissionsRepository(database)
    await use(factory)
  },

  seedAccreditations: async ({ mongoClient }, use) => {
    await use(async () => {
      const acc1 = buildAccreditation()
      const acc2 = buildAccreditation()
      const acc3 = buildAccreditation()
      const testData = [acc1, acc2, acc3]

      await mongoClient
        .db(DATABASE_NAME)
        .collection('accreditation')
        .insertMany(
          testData.map((acc) => ({
            _id: ObjectId.createFromHexString(acc.id),
            ...acc
          }))
        )

      return testData
    })
  },

  seedRegistrations: async ({ mongoClient }, use) => {
    await use(async () => {
      const reg1 = buildRegistration()
      const reg2 = buildRegistration()
      const reg3 = buildRegistration()
      const testData = [reg1, reg2, reg3]

      await mongoClient
        .db(DATABASE_NAME)
        .collection('registration')
        .insertMany(
          testData.map((reg) => ({
            _id: ObjectId.createFromHexString(reg.id),
            ...reg
          }))
        )

      return testData
    })
  },

  seedOrganisations: async ({ mongoClient }, use) => {
    await use(async () => {
      const org1 = buildOrganisation()
      const org2 = buildOrganisation()
      const org3 = buildOrganisation()
      const testData = [org1, org2, org3]

      await mongoClient
        .db(DATABASE_NAME)
        .collection('organisation')
        .insertMany(
          testData.map((org) => ({
            _id: ObjectId.createFromHexString(org.id),
            ...org
          }))
        )

      return testData
    })
  }
})

describe('MongoDB form submissions repository', () => {
  beforeEach(async ({ mongoClient }) => {
    await mongoClient
      .db(DATABASE_NAME)
      .collection('accreditation')
      .deleteMany({})
    await mongoClient
      .db(DATABASE_NAME)
      .collection('registration')
      .deleteMany({})
    await mongoClient
      .db(DATABASE_NAME)
      .collection('organisation')
      .deleteMany({})
  })

  it('should create repository instance', async ({
    formSubmissionsRepository
  }) => {
    const repository = formSubmissionsRepository()
    expect(repository).toBeDefined()
    expect(repository.findAllRegistrations).toBeDefined()
    expect(repository.findRegistrationsBySystemReference).toBeDefined()
    expect(repository.findRegistrationById).toBeDefined()
    expect(repository.findAllAccreditations).toBeDefined()
    expect(repository.findAccreditationsBySystemReference).toBeDefined()
    expect(repository.findAccreditationById).toBeDefined()
    expect(repository.findAllOrganisations).toBeDefined()
    expect(repository.findOrganisationById).toBeDefined()
  })

  testFormSubmissionsRepositoryContract(it)

  describe('plugin wiring', () => {
    it('makes repository available on request via plugin', async ({
      mongoClient,
      seedAccreditations
    }) => {
      await seedAccreditations()

      const server = Hapi.server()

      // Provide db dependency that the plugin expects
      const fakeMongoPlugin = {
        name: 'mongodb',
        register: async (s) => {
          s.decorate('server', 'db', mongoClient.db(DATABASE_NAME))
        }
      }
      await server.register(fakeMongoPlugin)
      await server.register(mongoFormSubmissionsRepositoryPlugin)

      server.route({
        method: 'GET',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          const accreditations =
            await request.formSubmissionsRepository.findAllAccreditations()
          return { count: accreditations.length }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'GET', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.count).toBe(3)
    })
  })
})

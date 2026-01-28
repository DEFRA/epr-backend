import Hapi from '@hapi/hapi'
import { beforeEach, describe, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { createOrganisationsRepository } from './mongodb.js'
import { testOrganisationsRepositoryContract } from './port.contract.js'
import { buildOrganisation, prepareOrgUpdate } from './contract/test-data.js'
import {
  ORGANISATION_STATUS,
  REG_ACC_STATUS
} from '#domain/organisations/model.js'
import { mongoOrganisationsRepositoryPlugin } from './mongodb.plugin.js'

const COLLECTION_NAME = 'epr-organisations'
const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  organisationsRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = await createOrganisationsRepository(database)
    await use(factory)
  }
})

describe('MongoDB organisations repository', () => {
  beforeEach(async ({ mongoClient }) => {
    await mongoClient
      .db(DATABASE_NAME)
      .collection(COLLECTION_NAME)
      .deleteMany({})
  })

  describe('organisations repository contract', () => {
    testOrganisationsRepositoryContract(it)
  })

  describe('MongoDB-specific error handling', () => {
    it('rethrows unexpected database errors during insert', async () => {
      const dbMock = {
        collection: () => ({
          createIndex: async () => {},
          insertOne: async () => {
            const error = new Error('Unexpected database error')
            error.code = 99999
            throw error
          }
        })
      }

      const factory = await createOrganisationsRepository(dbMock)
      const repository = factory()
      const orgData = buildOrganisation()

      await expect(repository.insert(orgData)).rejects.toThrow(
        'Unexpected database error'
      )
    })
  })

  describe('status field storage', () => {
    it('does not persist status field to database ', async ({
      organisationsRepository,
      mongoClient
    }) => {
      const repository = organisationsRepository()
      const organisation = buildOrganisation()
      await repository.insert(organisation)

      const orgAfterInsert = await repository.findById(organisation.id)
      // Update with status at all levels  (organisation, registration, accreditation)
      await repository.replace(
        organisation.id,
        1,
        prepareOrgUpdate(orgAfterInsert, {
          status: ORGANISATION_STATUS.REJECTED,
          registrations: [
            {
              ...organisation.registrations[0],
              status: REG_ACC_STATUS.REJECTED
            }
          ],
          accreditations: [
            {
              ...organisation.accreditations[0],
              status: REG_ACC_STATUS.REJECTED
            }
          ]
        })
      )

      // Read directly from MongoDB (bypassing repository mapping)
      const rawDoc = await mongoClient
        .db(DATABASE_NAME)
        .collection(COLLECTION_NAME)
        .findOne({ _id: ObjectId.createFromHexString(organisation.id) })

      expect(rawDoc.status).toBeUndefined()
      expect(rawDoc.registrations[0].status).toBeUndefined()
      expect(rawDoc.accreditations[0].status).toBeUndefined()
    })
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
      await server.register(mongoOrganisationsRepositoryPlugin)

      server.route({
        method: 'POST',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          const org = buildOrganisation()
          await request.organisationsRepository.insert(org)
          const found = await request.organisationsRepository.findById(org.id)
          return { inserted: org.id, found: found?.id }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'POST', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.found).toBe(result.inserted)
    })
  })
})

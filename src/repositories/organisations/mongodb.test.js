import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient, ObjectId } from 'mongodb'
import { createOrganisationsRepository } from './mongodb.js'
import { testOrganisationsRepositoryContract } from './port.contract.js'
import { buildOrganisation } from './contract/test-data.js'

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
    const factory = createOrganisationsRepository(database)
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
          insertOne: async () => {
            const error = new Error('Unexpected database error')
            error.code = 99999
            throw error
          }
        })
      }

      const repository = createOrganisationsRepository(dbMock)()
      const orgData = buildOrganisation()

      await expect(repository.insert(orgData)).rejects.toThrow(
        'Unexpected database error'
      )
    })
  })

  describe('handling missing registrations/accreditations', () => {
    it('handles status update when arrays are set to null directly in database', async ({
      organisationsRepository,
      mongoClient
    }) => {
      const repository = organisationsRepository()
      const organisation = buildOrganisation()
      await repository.insert(organisation)

      // Directly set arrays to null in database (simulating edge case)
      await mongoClient
        .db(DATABASE_NAME)
        .collection(COLLECTION_NAME)
        .updateOne(
          { _id: ObjectId.createFromHexString(organisation.id) },
          { $set: { registrations: null, accreditations: null } }
        )

      await repository.update(organisation.id, 1, {
        status: 'approved'
      })

      const result = await repository.findById(organisation.id)
      expect(result.status).toBe('approved')
      expect(result.statusHistory).toHaveLength(2)
      expect(result.statusHistory[0].status).toBe('created')
      expect(result.statusHistory[1].status).toBe('approved')
      expect(result.statusHistory[1].updatedAt).toBeInstanceOf(Date)
      expect(result.registrations).toBeNull()
      expect(result.accreditations).toBeNull()
    })
  })
})

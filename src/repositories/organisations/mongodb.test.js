import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest'
import { createOrganisationsRepository } from './mongodb.js'
import { testOrganisationsRepositoryContract } from './port.contract.js'
import { buildOrganisation } from './contract/test-data.js'
import { ObjectId } from 'mongodb'

describe('MongoDB organisations repository', () => {
  let server
  let organisationsRepositoryFactory
  const COLLECTION_NAME = 'epr-organisations'

  beforeAll(async () => {
    const { createServer } = await import('#server/server.js')
    server = await createServer()
    await server.initialize()

    organisationsRepositoryFactory = createOrganisationsRepository(server.db)
  })

  beforeEach(async () => {
    await server.db.collection(COLLECTION_NAME).deleteMany({})
  })

  afterAll(async () => {
    await server.stop()
  })

  describe('organisations repository contract', () => {
    testOrganisationsRepositoryContract(() => organisationsRepositoryFactory())
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
    it('handles status update when arrays are set to null directly in database', async () => {
      const repository = organisationsRepositoryFactory()
      const organisation = buildOrganisation()
      await repository.insert(organisation)

      // Directly set arrays to null in database (simulating edge case)
      await server.db
        .collection(COLLECTION_NAME)
        .updateOne(
          { _id: new ObjectId(organisation.id) },
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

import {
  dbInstanceTest as test,
  beforeEach,
  describe,
  expect
} from '../../../.vite/db-fixture.js'
import { createOrganisationsRepository } from './mongodb.js'
import { testOrganisationsRepositoryContract } from './port.contract.js'
import { buildOrganisation } from './contract/test-data.js'
import { ObjectId } from 'mongodb'

describe('MongoDB organisations repository', () => {
  const COLLECTION_NAME = 'epr-organisations'

  beforeEach(async ({ dbInstance }) => {
    await dbInstance.collection(COLLECTION_NAME).deleteMany({})
  })

  test('organisations repository contract', async ({ dbInstance }) => {
    const organisationsRepositoryFactory =
      createOrganisationsRepository(dbInstance)
    testOrganisationsRepositoryContract(() => organisationsRepositoryFactory())
  })

  describe('MongoDB-specific error handling', () => {
    test('rethrows unexpected database errors during insert', async () => {
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
    test('handles status update when arrays are set to null directly in database', async ({
      dbInstance
    }) => {
      const organisationsRepositoryFactory =
        createOrganisationsRepository(dbInstance)
      const repository = organisationsRepositoryFactory()
      const organisation = buildOrganisation()
      await repository.insert(organisation)

      // Directly set arrays to null in database (simulating edge case)
      await dbInstance
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

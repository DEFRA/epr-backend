import { afterAll, beforeAll, beforeEach, describe, it, expect } from 'vitest'
import {
  setupRepositoryDb,
  teardownRepositoryDb
} from '#vite/fixtures/repository-db.js'
import { SCHEMA_VERSION, ORG_ID_START_NUMBER } from '#common/enums/index.js'
import { createApplicationsRepository } from './mongodb.js'
import { testApplicationsRepositoryContract } from './port.contract.js'

describe('MongoDB applications repository', () => {
  let db
  let mongoClient
  let applicationsRepositoryFactory

  beforeAll(async () => {
    const setup = await setupRepositoryDb()
    db = setup.db
    mongoClient = setup.mongoClient
    applicationsRepositoryFactory = createApplicationsRepository(db)
  })

  beforeEach(async () => {
    await db.collection('accreditation').deleteMany({})
    await db.collection('registration').deleteMany({})
    await db.collection('organisation').deleteMany({})
  })

  afterAll(async () => {
    await teardownRepositoryDb(mongoClient)
  })

  testApplicationsRepositoryContract((logger) =>
    applicationsRepositoryFactory(logger)
  )

  describe('MongoDB-specific error handling', () => {
    it('re-throws non-validation errors from MongoDB', async () => {
      const mockDb = {
        collection: () => ({
          insertOne: async () => {
            const error = new Error('Connection timeout')
            error.code = 'ETIMEOUT'
            throw error
          }
        })
      }

      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = createApplicationsRepository(mockDb)
      const repository = repositoryFactory(mockLogger)

      await expect(
        repository.insertAccreditation({
          schemaVersion: SCHEMA_VERSION,
          createdAt: new Date(),
          orgId: ORG_ID_START_NUMBER + 123,
          referenceNumber: '607f1f77bcf86cd799439099',
          answers: [],
          rawSubmissionData: {}
        })
      ).rejects.toThrow('Connection timeout')
    })
  })
})

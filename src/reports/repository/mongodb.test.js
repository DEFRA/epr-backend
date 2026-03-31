import { beforeEach, describe, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createReportsRepository } from './mongodb.js'
import { testReportsRepositoryContract } from './port.contract.js'
import { buildCreateReportParams } from '#root/reports/repository/contract/test-data.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  reportsRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = await createReportsRepository(database)
    await use(factory)
  }
})

describe('MongoDB reports repository', () => {
  beforeEach(async ({ mongoClient }) => {
    const database = mongoClient.db(DATABASE_NAME)
    await database.collection('reports').deleteMany({})
  })

  it('creates a repository', ({ reportsRepository }) => {
    expect(reportsRepository).toBeDefined()
  })

  describe('reports repository contract', () => {
    testReportsRepositoryContract(it)
  })

  describe('MongoDB-specific error handling', () => {
    it('re-throws non-duplicate key errors during createReport', async () => {
      const unexpectedError = new Error('Database connection lost')
      unexpectedError.code = 'ECONNREFUSED'

      const mockDb = {
        collection: function () {
          return this
        },
        createIndex: async () => {},
        insertOne: async () => {
          throw unexpectedError
        }
      }

      const factory = await createReportsRepository(mockDb)
      const repository = factory()

      const params = buildCreateReportParams()

      await expect(repository.createReport(params)).rejects.toThrow(
        'Database connection lost'
      )
    })
  })
})

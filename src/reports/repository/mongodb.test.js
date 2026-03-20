import { describe, beforeEach, expect } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createReportsRepository } from './mongodb.js'
import { testReportsRepositoryContract } from './port.contract.js'

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
    await database.collection('periodic-reports').deleteMany({})
  })

  it('creates a repository', ({ reportsRepository }) => {
    expect(reportsRepository).toBeDefined()
  })

  describe('reports repository contract', () => {
    testReportsRepositoryContract(it)
  })
})

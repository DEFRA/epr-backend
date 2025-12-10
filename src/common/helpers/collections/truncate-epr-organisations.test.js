import { beforeEach, describe, expect, it, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { logger } from '#common/helpers/logging/logger.js'
import { truncateEprOrganisations } from './truncate-epr-organisations.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'
import eprOrganisation1 from '#data/fixtures/common/epr-organisations/sample-organisation-1.json' with { type: 'json' }
import eprOrganisation2 from '#data/fixtures/common/epr-organisations/sample-organisation-2.json' with { type: 'json' }
import eprOrganisation3 from '#data/fixtures/common/epr-organisations/sample-organisation-3.json' with { type: 'json' }

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}))

describe('truncateEprOrganisations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs error when truncation fails', async () => {
    const error = new Error('Database connection lost')
    const mockDb = createMockDb({ shouldThrow: error })
    const shouldTruncateEprOrg = () => true

    await truncateEprOrganisations(mockDb, shouldTruncateEprOrg)

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Truncating epr-organisations collection'
    })
    expect(logger.error).toHaveBeenCalledWith({
      message: 'Failed to truncate collection epr-organisations',
      error
    })
  })

  it('logs and exits early when truncation is disabled', async () => {
    const mockDb = createMockDb()
    const shouldTruncateEprOrg = () => false

    await truncateEprOrganisations(mockDb, shouldTruncateEprOrg)

    expect(logger.info).toHaveBeenCalledWith({
      message: 'Truncating epr-organisations collection is disabled'
    })
    expect(mockDb.collection).not.toHaveBeenCalled()
  })
})

function createMockDb({ deletedCount = 0, shouldThrow = null } = {}) {
  return {
    collection: vi.fn(() => ({
      deleteMany: vi.fn(async () => {
        if (shouldThrow) {
          throw shouldThrow
        }
        return { deletedCount }
      })
    }))
  }
}

const DATABASE_NAME = 'epr-backend'
const COLLECTION_NAME = 'epr-organisations'

const testIt = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  }
})

describe('truncateEprOrganisations - MongoDB integration', () => {
  beforeEach(async ({ mongoClient }) => {
    vi.clearAllMocks()
    await mongoClient
      .db(DATABASE_NAME)
      .collection(COLLECTION_NAME)
      .deleteMany({})
  })

  testIt(
    'truncates collection when enabled and logs success',
    async ({ mongoClient }) => {
      const db = mongoClient.db(DATABASE_NAME)
      const collection = db.collection(COLLECTION_NAME)
      const repository = createOrganisationsRepository(db)()

      // Seed data using epr-organisation fixtures
      await repository.insert(eprOrganisation1)
      await repository.insert(eprOrganisation2)
      await repository.insert(eprOrganisation3)

      // Verify documents exist
      const countBefore = await collection.countDocuments()
      expect(countBefore).toBe(3)

      // Truncate
      const shouldTruncateEprOrg = () => true
      await truncateEprOrganisations(db, shouldTruncateEprOrg)

      // Verify all documents deleted
      const countAfter = await collection.countDocuments()
      expect(countAfter).toBe(0)

      // Verify logger was called with correct count
      expect(logger.info).toHaveBeenCalledWith({
        message: 'Truncating epr-organisations collection'
      })
      expect(logger.info).toHaveBeenCalledWith({
        message:
          'Successfully truncated collection epr-organisations, number of documents deleted: 3'
      })
    }
  )
})

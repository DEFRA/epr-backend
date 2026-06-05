import { describe, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { createSystemLogsRepository } from './mongodb.js'
import { testSystemLogsRepositoryContract } from './port.contract.js'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'crypto'

/** @import { Db } from 'mongodb' */
/** @import { TypedLogger } from '#common/helpers/logging/logger.js' */
/** @import { SystemLog } from './port.js' */

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(
      /** @type {string} */ (/** @type {unknown} */ (db))
    )
    await use(client)
    await client.close()
  },

  systemLogsRepository: async ({ mongoClient }, use) => {
    const client = /** @type {MongoClient} */ (
      /** @type {unknown} */ (mongoClient)
    )
    const factory = await createSystemLogsRepository(client.db('epr-backend'))
    await use(factory)
  }
})

const buildMockDb = () => {
  let callCount = 0
  return /** @type {Db} */ (
    /** @type {unknown} */ ({
      collection: () => {
        callCount++
        if (callCount === 1) {
          return { createIndex: async () => {} }
        }
        throw new Error('error accessing db')
      }
    })
  )
}

const buildMockLogger = () =>
  /** @type {TypedLogger} */ (
    /** @type {unknown} */ ({ info: vi.fn(), error: vi.fn(), warn: vi.fn() })
  )

const buildSystemLog = () =>
  /** @type {SystemLog} */ (
    /** @type {unknown} */ ({
      createdAt: new Date(),
      createdBy: { id: 'system', email: 'system', scope: [] },
      event: { category: 'c', action: 'a' },
      context: { organisationId: randomUUID() }
    })
  )

describe('Mongo DB system logs repository', () => {
  describe('system logs repository contract', () => {
    testSystemLogsRepositoryContract(it)
  })

  it('fails gracefully and logs an error when DB write fails', async () => {
    const mockLogger = buildMockLogger()
    const mockDb = buildMockDb()
    const collectionSpy = vi.spyOn(
      /** @type {{ collection: () => unknown }} */ (
        /** @type {unknown} */ (mockDb)
      ),
      'collection'
    )

    const repositoryFactory = await createSystemLogsRepository(mockDb)
    const repository = repositoryFactory(mockLogger)

    await repository.insert(buildSystemLog())

    expect(collectionSpy).toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('fails gracefully and logs an error when insertMany DB write fails', async () => {
    const mockLogger = buildMockLogger()
    const repositoryFactory = await createSystemLogsRepository(buildMockDb())
    const repository = repositoryFactory(mockLogger)

    await repository.insertMany([buildSystemLog()])

    expect(mockLogger.error).toHaveBeenCalled()
  })
})

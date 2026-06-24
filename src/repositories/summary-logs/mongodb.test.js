import { randomUUID } from 'node:crypto'
import { describe, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createSummaryLogsRepository } from './mongodb.js'
import { testSummaryLogsRepositoryContract } from './port.contract.js'
import { createMockLogger } from '#test/mock-logger.js'
import { summaryLogFactory } from './contract/test-data.js'

/** @import { Db } from 'mongodb' */
/** @import { SummaryLogsS3Config } from './mongodb.js' */
/** @import { SummaryLogsRepository, SummaryLogsRepositoryFactory } from './port.js' */

const DATABASE_NAME = 'epr-backend'

const SIXTY_SECONDS = 60

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockImplementation(async (_client, command) => {
    return `https://${command.input.Bucket}.s3.amazonaws.com/${command.input.Key}?signed=true`
  })
}))

const mockS3Config = /** @type {SummaryLogsS3Config} */ (
  /** @type {unknown} */ ({
    s3Client: {},
    preSignedUrlExpiry: SIXTY_SECONDS
  })
)

/**
 * @typedef {object} SummaryLogsRepoFixtures
 * @property {import('mongodb').MongoClient} mongoClient
 * @property {SummaryLogsRepositoryFactory} summaryLogsRepositoryFactory
 * @property {SummaryLogsRepository} summaryLogsRepository
 */

const it = /** @type {import('vitest').TestAPI<SummaryLogsRepoFixtures>} */ (
  mongoIt.extend({
    mongoClient: async ({ db }, use) => {
      const client = await MongoClient.connect(db)
      await use(client)
      await client.close()
    },

    summaryLogsRepositoryFactory: async ({ mongoClient }, use) => {
      const database = mongoClient.db(DATABASE_NAME)
      const factory = await createSummaryLogsRepository(database, mockS3Config)
      await use(factory)
    },

    summaryLogsRepository: async ({ summaryLogsRepositoryFactory }, use) => {
      const mockLogger = createMockLogger()
      const repository = summaryLogsRepositoryFactory(mockLogger)
      await use(repository)
    }
  })
)

describe('MongoDB summary logs repository', () => {
  describe('summary logs repository contract', () => {
    testSummaryLogsRepositoryContract(it)
  })

  describe('MongoDB-specific error handling', () => {
    it('re-throws non-duplicate key errors from MongoDB', async () => {
      const mockDb = /** @type {Db} */ (
        /** @type {unknown} */ ({
          collection: () => ({
            createIndex: async () => {},
            findOne: async () => null, // No existing submitting log
            insertOne: async () => {
              throw Object.assign(new Error('Connection timeout'), {
                code: 'ETIMEOUT'
              })
            }
          })
        })
      )

      const mockLogger = createMockLogger()
      const repositoryFactory = await createSummaryLogsRepository(
        mockDb,
        mockS3Config
      )
      const repository = repositoryFactory(mockLogger)

      await expect(
        repository.insert(
          `test-${randomUUID()}`,
          summaryLogFactory.validating()
        )
      ).rejects.toThrow('Connection timeout')
    })
  })

  describe('transitionToSubmittingExclusive edge cases', () => {
    it('returns success: false when findOneAndUpdate fails due to concurrent modification', async () => {
      const logId = `test-${randomUUID()}`
      let findOneCallCount = 0

      const mockDb = /** @type {Db} */ (
        /** @type {unknown} */ ({
          collection: () => ({
            createIndex: async () => {},
            findOne: async () => {
              findOneCallCount++
              if (findOneCallCount === 1) {
                // First call: document exists and is validated
                return {
                  _id: logId,
                  version: 1,
                  status: 'validated',
                  organisationId: 'org-1',
                  registrationId: 'reg-1'
                }
              }
              // Second call: check for existing submitting - none found
              return null
            },
            findOneAndUpdate: async () => null // Concurrent modification beat us
          })
        })
      )

      const mockLogger = createMockLogger()
      const repositoryFactory = await createSummaryLogsRepository(
        mockDb,
        mockS3Config
      )
      const repository = repositoryFactory(mockLogger)

      const result = await repository.transitionToSubmittingExclusive(logId)

      expect(result.success).toBe(false)
    })

    it('returns success: false when unique index violation occurs (race condition)', async () => {
      const logId = `test-${randomUUID()}`
      let findOneCallCount = 0

      const mockDb = /** @type {Db} */ (
        /** @type {unknown} */ ({
          collection: () => ({
            createIndex: async () => {},
            findOne: async () => {
              findOneCallCount++
              if (findOneCallCount === 1) {
                // First call: document exists and is validated
                return {
                  _id: logId,
                  version: 1,
                  status: 'validated',
                  organisationId: 'org-1',
                  registrationId: 'reg-1'
                }
              }
              // Second call: check for existing submitting - none found
              return null
            },
            findOneAndUpdate: async () => {
              // Another request beat us and the unique index blocks our update
              throw Object.assign(
                new Error(
                  'E11000 duplicate key error collection: epr-backend.summary-logs'
                ),
                { code: 11000 }
              )
            }
          })
        })
      )

      const mockLogger = createMockLogger()
      const repositoryFactory = await createSummaryLogsRepository(
        mockDb,
        mockS3Config
      )
      const repository = repositoryFactory(mockLogger)

      const result = await repository.transitionToSubmittingExclusive(logId)

      expect(result.success).toBe(false)
    })

    it('re-throws non-duplicate key errors from findOneAndUpdate', async () => {
      const logId = `test-${randomUUID()}`
      let findOneCallCount = 0

      const mockDb = /** @type {Db} */ (
        /** @type {unknown} */ ({
          collection: () => ({
            createIndex: async () => {},
            findOne: async () => {
              findOneCallCount++
              if (findOneCallCount === 1) {
                // First call: document exists and is validated
                return {
                  _id: logId,
                  version: 1,
                  status: 'validated',
                  organisationId: 'org-1',
                  registrationId: 'reg-1'
                }
              }
              // Second call: check for existing submitting - none found
              return null
            },
            findOneAndUpdate: async () => {
              throw Object.assign(new Error('Connection timeout'), {
                code: 'ETIMEOUT'
              })
            }
          })
        })
      )

      const mockLogger = createMockLogger()
      const repositoryFactory = await createSummaryLogsRepository(
        mockDb,
        mockS3Config
      )
      const repository = repositoryFactory(mockLogger)

      await expect(
        repository.transitionToSubmittingExclusive(logId)
      ).rejects.toThrow('Connection timeout')
    })
  })
})

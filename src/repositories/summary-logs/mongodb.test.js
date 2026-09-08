import { randomUUID } from 'node:crypto'
import { describe, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createSummaryLogsRepository } from './mongodb.js'
import { testSummaryLogsRepositoryContract } from './port.contract.js'
import { createMockLogger } from '#test/mock-logger.js'
import { summaryLogFactory } from './contract/test-data.js'
import { createMockDb } from '#test/mock-db.js'
import { createMongoError } from '#test/mongo-error.js'
import { partialMock } from '#test/type-helpers.js'

/**
 * @import { SummaryLogsS3Config } from './mongodb.js'
 * @import { SummaryLogsRepositoryFactory, SummaryLogsRepository } from './port.js'
 * @typedef {{ mongoClient: MongoClient, summaryLogsRepositoryFactory: SummaryLogsRepositoryFactory, summaryLogsRepository: SummaryLogsRepository }} SummaryLogsFixtures
 */

const DATABASE_NAME = 'epr-backend'

const SIXTY_SECONDS = 60

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockImplementation(async (_client, command) => {
    return `https://${command.input.Bucket}.s3.amazonaws.com/${command.input.Key}?signed=true`
  })
}))

/** @type {SummaryLogsS3Config} */
const mockS3Config = {
  s3Client: partialMock({}),
  preSignedUrlExpiry: SIXTY_SECONDS
}

const it = /** @type {import('vitest').TestAPI<SummaryLogsFixtures>} */ (
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
      const repository = summaryLogsRepositoryFactory(createMockLogger())
      await use(repository)
    }
  })
)

describe('MongoDB summary logs repository', () => {
  describe('summary logs repository contract', () => {
    testSummaryLogsRepositoryContract(it)
  })

  // Not a contract assertion: the in-memory adapter fabricates its URL.
  describe('getDownloadUrl names the file', () => {
    /** @returns {Promise<string | undefined>} */
    const lastSignedDisposition = async () => {
      const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')
      const input = /** @type {{ ResponseContentDisposition?: string }} */ (
        vi.mocked(getSignedUrl).mock.lastCall?.[1].input
      )

      return input?.ResponseContentDisposition
    }

    /**
     * @param {SummaryLogsRepository} repository
     * @param {Record<string, unknown>} [overrides]
     * @returns {Promise<string>}
     */
    const insertSubmitted = async (repository, overrides = {}) => {
      const id = `mongo-${randomUUID()}`
      await repository.insert(
        id,
        summaryLogFactory.submitted({
          organisationId: 'org-1',
          registrationId: 'reg-1',
          file: { uri: 's3://re-ex-summary-logs/uploads/test-file.xlsx' },
          ...overrides
        })
      )

      return id
    }

    it('names it for the registration and the moment it was submitted', async ({
      summaryLogsRepository
    }) => {
      const id = await insertSubmitted(summaryLogsRepository)

      await summaryLogsRepository.getDownloadUrl(id, 'R26ER5000000002PA')

      expect(await lastSignedDisposition()).toBe(
        'attachment; filename="R26ER5000000002PA-2024-01-01-000000.xlsx"'
      )
    })

    it('names a resubmission on the same day differently', async ({
      summaryLogsRepository
    }) => {
      const morning = await insertSubmitted(summaryLogsRepository, {
        submittedAt: '2024-01-01T09:15:30.000Z'
      })
      const afternoon = await insertSubmitted(summaryLogsRepository, {
        submittedAt: '2024-01-01T16:42:07.000Z'
      })

      await summaryLogsRepository.getDownloadUrl(morning, 'R26ER5000000002PA')
      const first = await lastSignedDisposition()

      await summaryLogsRepository.getDownloadUrl(afternoon, 'R26ER5000000002PA')

      expect(first).toBe(
        'attachment; filename="R26ER5000000002PA-2024-01-01-091530.xlsx"'
      )
      expect(await lastSignedDisposition()).toBe(
        'attachment; filename="R26ER5000000002PA-2024-01-01-164207.xlsx"'
      )
    })

    it('names it not at all where the registration carries no number', async ({
      summaryLogsRepository
    }) => {
      const id = await insertSubmitted(summaryLogsRepository)

      await summaryLogsRepository.getDownloadUrl(id)

      expect(await lastSignedDisposition()).toBeUndefined()
    })
  })

  describe('MongoDB-specific error handling', () => {
    it('re-throws non-duplicate key errors from MongoDB', async () => {
      const mockDb = createMockDb({
        createIndex: async () => {},
        findOne: async () => null, // No existing submitting log
        insertOne: async () => {
          throw createMongoError('Connection timeout', { code: 'ETIMEOUT' })
        }
      })

      const repositoryFactory = await createSummaryLogsRepository(
        mockDb,
        mockS3Config
      )
      const repository = repositoryFactory(createMockLogger())

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

      const mockDb = createMockDb({
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

      const repositoryFactory = await createSummaryLogsRepository(
        mockDb,
        mockS3Config
      )
      const repository = repositoryFactory(createMockLogger())

      const result = await repository.transitionToSubmittingExclusive(logId)

      expect(result.success).toBe(false)
    })

    it('returns success: false when unique index violation occurs (race condition)', async () => {
      const logId = `test-${randomUUID()}`
      let findOneCallCount = 0

      const mockDb = createMockDb({
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
          throw createMongoError(
            'E11000 duplicate key error collection: epr-backend.summary-logs',
            { code: 11000 }
          )
        }
      })

      const repositoryFactory = await createSummaryLogsRepository(
        mockDb,
        mockS3Config
      )
      const repository = repositoryFactory(createMockLogger())

      const result = await repository.transitionToSubmittingExclusive(logId)

      expect(result.success).toBe(false)
    })

    it('re-throws non-duplicate key errors from findOneAndUpdate', async () => {
      const logId = `test-${randomUUID()}`
      let findOneCallCount = 0

      const mockDb = createMockDb({
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
          throw createMongoError('Connection timeout', { code: 'ETIMEOUT' })
        }
      })

      const repositoryFactory = await createSummaryLogsRepository(
        mockDb,
        mockS3Config
      )
      const repository = repositoryFactory(createMockLogger())

      await expect(
        repository.transitionToSubmittingExclusive(logId)
      ).rejects.toThrow('Connection timeout')
    })
  })

  describe('legacy numeric row IDs', () => {
    const category = (rowIds) => ({ count: rowIds.length, rowIds })

    const validity = (rowIds) => ({
      valid: category(rowIds),
      invalid: category([]),
      included: category([]),
      excluded: category([])
    })

    /**
     * Summary logs written before ROW_ID coercion hold row IDs as numbers.
     * No current writer produces that shape and the storage schema rejects it,
     * so the document has to be seeded straight into the collection.
     */
    const insertLegacySummaryLog = async (mongoClient, overrides) => {
      const id = `legacy-rowids-${randomUUID()}`

      await mongoClient
        .db(DATABASE_NAME)
        .collection('summary-logs')
        .insertOne({
          _id: id,
          version: 1,
          ...summaryLogFactory.submitted(overrides),
          loads: {
            added: validity([1000, 1001]),
            unchanged: validity([]),
            adjusted: validity([])
          }
        })

      return id
    }

    it('findById returns them as strings', async ({
      mongoClient,
      summaryLogsRepository
    }) => {
      const id = await insertLegacySummaryLog(mongoClient, {})

      const found = await summaryLogsRepository.findById(id)

      expect(found?.summaryLog.loads?.added.valid.rowIds).toEqual([
        '1000',
        '1001'
      ])
    })

    it('findAllByOrgReg returns them as strings', async ({
      mongoClient,
      summaryLogsRepository
    }) => {
      const organisationId = `org-${randomUUID()}`
      const registrationId = `reg-${randomUUID()}`
      await insertLegacySummaryLog(mongoClient, {
        organisationId,
        registrationId
      })

      const results = await summaryLogsRepository.findAllByOrgReg(
        organisationId,
        registrationId
      )

      expect(results[0]?.summaryLog.loads?.added.valid.rowIds).toEqual([
        '1000',
        '1001'
      ])
    })
  })
})

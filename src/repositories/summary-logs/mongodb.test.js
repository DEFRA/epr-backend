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
import {
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

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

      await summaryLogsRepository.getDownloadUrl(
        id,
        toRegistrationNumber('R26ER5000000002PA')
      )

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

      await summaryLogsRepository.getDownloadUrl(
        morning,
        toRegistrationNumber('R26ER5000000002PA')
      )
      const first = await lastSignedDisposition()

      await summaryLogsRepository.getDownloadUrl(
        afternoon,
        toRegistrationNumber('R26ER5000000002PA')
      )

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

  describe('legacy index migration', () => {
    it('creates the year-scoped lock before dropping the pre-year-scoping lock', async () => {
      const calls = []
      const createdIndexes = []

      const mockDb = createMockDb({
        dropIndex: async (indexName) => {
          calls.push(`drop:${indexName}`)
        },
        createIndex: async (fields, options) => {
          calls.push(`create:${options?.name}`)
          createdIndexes.push({ fields, options })
        }
      })

      await createSummaryLogsRepository(mockDb, mockS3Config)

      expect(calls.filter((c) => c.startsWith('drop:'))).toEqual([
        'drop:organisationId_1_registrationId_1',
        'drop:organisationId_1_registrationId_1_year_1_accreditationId_1_status_1_submittedAt_-1',
        'drop:organisationId_1_registrationId_1_status_1_submittedAt_-1'
      ])
      expect(calls.indexOf('create:summary_log_submitting_lock')).toBeLessThan(
        calls.indexOf('drop:organisationId_1_registrationId_1')
      )
      const lockIndex = createdIndexes.find(
        (idx) => idx.options.name === 'summary_log_submitting_lock'
      )
      expect(lockIndex.fields).toStrictEqual({
        organisationId: 1,
        registrationId: 1,
        year: 1,
        accreditationId: 1
      })
    })

    it('reads by number through an index on the numbers, and drops the year-scoped id index no read uses', async ({
      mongoClient
    }) => {
      const database = mongoClient.db(`${DATABASE_NAME}-${randomUUID()}`)
      const collection = database.collection('summary-logs')
      await collection.createIndex({
        organisationId: 1,
        registrationId: 1,
        year: 1,
        accreditationId: 1,
        status: 1,
        submittedAt: -1
      })

      await createSummaryLogsRepository(database, mockS3Config)

      const keys = (await collection.indexes()).map(({ key }) => key)
      expect(keys).toContainEqual({
        organisationNumber: 1,
        registrationNumber: 1,
        status: 1,
        submittedAt: -1
      })
      expect(keys).not.toContainEqual(
        expect.objectContaining({ year: 1, accreditationId: 1, status: 1 })
      )
      await database.dropDatabase()
    })

    it('drops the id index the list by registration read through', async ({
      mongoClient
    }) => {
      const database = mongoClient.db(`${DATABASE_NAME}-${randomUUID()}`)
      const collection = database.collection('summary-logs')
      await collection.createIndex({
        organisationId: 1,
        registrationId: 1,
        status: 1,
        submittedAt: -1
      })

      await createSummaryLogsRepository(database, mockS3Config)

      const keys = (await collection.indexes()).map(({ key }) => key)
      expect(keys).not.toContainEqual(
        expect.objectContaining({ organisationId: 1, status: 1 })
      )
      await database.dropDatabase()
    })

    it.each(['IndexNotFound', 'NamespaceNotFound'])(
      'ignores %s when dropping a retired index',
      async (codeName) => {
        const mockDb = createMockDb({
          dropIndex: async () => {
            throw createMongoError('index missing', { codeName })
          },
          createIndex: async () => {}
        })

        await expect(
          createSummaryLogsRepository(mockDb, mockS3Config)
        ).resolves.toBeDefined()
      }
    )

    it('re-throws other errors from dropIndex', async () => {
      const mockDb = createMockDb({
        dropIndex: async () => {
          throw createMongoError('Connection timeout', { code: 'ETIMEOUT' })
        }
      })

      await expect(
        createSummaryLogsRepository(mockDb, mockS3Config)
      ).rejects.toThrow('Connection timeout')
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
    it('returns success: false when unique index violation occurs (race condition)', async () => {
      const logId = `test-${randomUUID()}`

      const mockDb = createMockDb({
        createIndex: async () => {},
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

      const mockDb = createMockDb({
        createIndex: async () => {},
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

    it('findAll returns them as strings', async ({
      mongoClient,
      summaryLogsRepository
    }) => {
      const key = {
        organisationNumber: toOrganisationNumber(
          String(Math.floor(Math.random() * 1e9) + 1)
        ),
        registrationNumber: toRegistrationNumber(`reg-${randomUUID()}`)
      }
      await insertLegacySummaryLog(mongoClient, key)

      const results = await summaryLogsRepository.findAll(key)

      expect(results[0]?.summaryLog.loads?.added.valid.rowIds).toEqual([
        '1000',
        '1001'
      ])
    })
  })
})

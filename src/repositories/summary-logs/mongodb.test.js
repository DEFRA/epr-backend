import { randomUUID } from 'node:crypto'
import { describe, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createSummaryLogsRepository } from './mongodb.js'
import { testSummaryLogsRepositoryContract } from './port.contract.js'
import { NO_PRIOR_SUBMISSION } from '#domain/summary-logs/status.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  summaryLogsRepositoryFactory: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = createSummaryLogsRepository(database)
    await use(factory)
  },

  summaryLogsRepository: async ({ summaryLogsRepositoryFactory }, use) => {
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn()
    }
    const repository = summaryLogsRepositoryFactory(mockLogger)
    await use(repository)
  }
})

describe('MongoDB summary logs repository', () => {
  describe('summary logs repository contract', () => {
    testSummaryLogsRepositoryContract(it)
  })

  describe('MongoDB-specific error handling', () => {
    it('re-throws non-duplicate key errors from MongoDB', async () => {
      const mockDb = {
        collection: () => ({
          findOne: async () => null, // No existing submitting log
          insertOne: async () => {
            const error = new Error('Connection timeout')
            error.code = 'ETIMEOUT'
            throw error
          }
        })
      }

      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = createSummaryLogsRepository(mockDb)
      const repository = repositoryFactory(mockLogger)

      await expect(
        repository.insert(`test-${randomUUID()}`, {
          status: 'validating',
          file: {
            id: `file-${randomUUID()}`,
            name: 'test.xlsx',
            status: 'complete',
            uri: 's3://bucket/key'
          },
          validatedAgainstSummaryLogId: NO_PRIOR_SUBMISSION
        })
      ).rejects.toThrow('Connection timeout')
    })
  })

  describe('transitionToSubmittingExclusive edge cases', () => {
    it('returns success: false when findOneAndUpdate fails due to concurrent modification', async () => {
      const logId = `test-${randomUUID()}`
      let findOneCallCount = 0

      const mockDb = {
        collection: () => ({
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
      }

      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = createSummaryLogsRepository(mockDb)
      const repository = repositoryFactory(mockLogger)

      const result = await repository.transitionToSubmittingExclusive(
        logId,
        1,
        'org-1',
        'reg-1'
      )

      expect(result.success).toBe(false)
    })

    it('reverts and returns success: false when race detected and we are not the winner', async () => {
      const logId = `test-bbb-${randomUUID()}` // Will not be min ID
      const winnerId = `test-aaa-${randomUUID()}` // Will be min ID (aaa < bbb)
      let findOneCallCount = 0

      const mockDb = {
        collection: () => ({
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
          findOneAndUpdate: async () => ({
            // Update succeeds
            _id: logId,
            version: 2,
            status: 'submitting',
            submittedAt: new Date().toISOString(),
            organisationId: 'org-1',
            registrationId: 'reg-1'
          }),
          find: () => ({
            project: () => ({
              toArray: async () => [
                { _id: winnerId }, // Another document is also submitting
                { _id: logId } // Our document
              ]
            })
          }),
          updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }) // Revert succeeds
        })
      }

      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = createSummaryLogsRepository(mockDb)
      const repository = repositoryFactory(mockLogger)

      const result = await repository.transitionToSubmittingExclusive(
        logId,
        1,
        'org-1',
        'reg-1'
      )

      expect(result.success).toBe(false)
    })

    it('returns success: true when race detected but we are the winner', async () => {
      const logId = `test-aaa-${randomUUID()}` // Will be min ID
      const loserId = `test-bbb-${randomUUID()}` // Will not be min ID (bbb > aaa)
      let findOneCallCount = 0

      const mockDb = {
        collection: () => ({
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
          findOneAndUpdate: async () => ({
            // Update succeeds
            _id: logId,
            version: 2,
            status: 'submitting',
            submittedAt: new Date().toISOString(),
            organisationId: 'org-1',
            registrationId: 'reg-1'
          }),
          find: () => ({
            project: () => ({
              toArray: async () => [
                { _id: logId }, // Our document
                { _id: loserId } // Another document is also submitting
              ]
            })
          })
        })
      }

      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = createSummaryLogsRepository(mockDb)
      const repository = repositoryFactory(mockLogger)

      const result = await repository.transitionToSubmittingExclusive(
        logId,
        1,
        'org-1',
        'reg-1'
      )

      expect(result.success).toBe(true)
      expect(result.version).toBe(2)
      expect(result.summaryLog.status).toBe('submitting')
    })
  })
})

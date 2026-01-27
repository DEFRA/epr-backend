import { randomUUID } from 'node:crypto'
import Hapi from '@hapi/hapi'
import { describe, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { MongoClient } from 'mongodb'
import { createSummaryLogsRepository } from './mongodb.js'
import { testSummaryLogsRepositoryContract } from './port.contract.js'
import { summaryLogFactory } from './contract/test-data.js'
import { mongoSummaryLogsRepositoryPlugin } from '#plugins/repositories/mongo-summary-logs-repository-plugin.js'

const DATABASE_NAME = 'epr-backend'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  summaryLogsRepositoryFactory: async ({ mongoClient }, use) => {
    const database = mongoClient.db(DATABASE_NAME)
    const factory = await createSummaryLogsRepository(database)
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
          createIndex: async () => {},
          findOne: async () => null, // No existing submitting log
          insertOne: async () => {
            const error = new Error('Connection timeout')
            error.code = 'ETIMEOUT'
            throw error
          }
        })
      }

      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = await createSummaryLogsRepository(mockDb)
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

      const mockDb = {
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
      }

      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = await createSummaryLogsRepository(mockDb)
      const repository = repositoryFactory(mockLogger)

      const result = await repository.transitionToSubmittingExclusive(
        logId,
        1,
        'org-1',
        'reg-1'
      )

      expect(result.success).toBe(false)
    })

    it('returns success: false when unique index violation occurs (race condition)', async () => {
      const logId = `test-${randomUUID()}`
      let findOneCallCount = 0

      const mockDb = {
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
            const error = new Error(
              'E11000 duplicate key error collection: epr-backend.summary-logs'
            )
            error.code = 11000
            throw error
          }
        })
      }

      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = await createSummaryLogsRepository(mockDb)
      const repository = repositoryFactory(mockLogger)

      const result = await repository.transitionToSubmittingExclusive(
        logId,
        1,
        'org-1',
        'reg-1'
      )

      expect(result.success).toBe(false)
    })

    it('re-throws non-duplicate key errors from findOneAndUpdate', async () => {
      const logId = `test-${randomUUID()}`
      let findOneCallCount = 0

      const mockDb = {
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
            const error = new Error('Connection timeout')
            error.code = 'ETIMEOUT'
            throw error
          }
        })
      }

      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = await createSummaryLogsRepository(mockDb)
      const repository = repositoryFactory(mockLogger)

      await expect(
        repository.transitionToSubmittingExclusive(logId, 1, 'org-1', 'reg-1')
      ).rejects.toThrow('Connection timeout')
    })
  })

  describe('plugin wiring', () => {
    it('makes repository available on request via plugin', async ({
      mongoClient
    }) => {
      const server = Hapi.server()

      // Provide db dependency that the plugin expects
      const fakeMongoPlugin = {
        name: 'mongodb',
        register: async (s) => {
          s.decorate('server', 'db', mongoClient.db(DATABASE_NAME))
        }
      }
      await server.register(fakeMongoPlugin)
      await server.register(mongoSummaryLogsRepositoryPlugin)

      // Provide request.logger that the plugin needs
      server.ext('onRequest', (request, h) => {
        request.logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
        return h.continue
      })

      server.route({
        method: 'POST',
        path: '/test',
        options: { auth: false },
        handler: async (request) => {
          const id = `test-${randomUUID()}`
          const summaryLog = summaryLogFactory.validating()
          await request.summaryLogsRepository.insert(id, summaryLog)
          const found = await request.summaryLogsRepository.findById(id)
          return { wasFound: found !== null }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'POST', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.wasFound).toBe(true)
    })
  })
})

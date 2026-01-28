import Hapi from '@hapi/hapi'
import { describe, expect, vi } from 'vitest'
import { it as mongoIt } from '#vite/fixtures/mongo.js'
import { createSystemLogsRepository } from './mongodb.js'
import { testSystemLogsRepositoryContract } from './port.contract.js'
import { MongoClient } from 'mongodb'
import { randomUUID } from 'crypto'
import { mongoSystemLogsRepositoryPlugin } from './mongodb.plugin.js'

const it = mongoIt.extend({
  mongoClient: async ({ db }, use) => {
    const client = await MongoClient.connect(db)
    await use(client)
    await client.close()
  },

  systemLogsRepository: async ({ mongoClient }, use) => {
    const database = mongoClient.db('epr-backend')
    const factory = await createSystemLogsRepository(database)
    await use(factory)
  }
})

describe('Mongo DB system logs repository', () => {
  describe('system logs repository contract', () => {
    testSystemLogsRepositoryContract(it)
  })

  it('fails gracefully and logs an error when DB write fails', async () => {
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn()
    }

    let callCount = 0
    const mockDb = {
      collection: () => {
        callCount++
        // First call is for createIndex during setup - let it pass
        if (callCount === 1) {
          return { createIndex: async () => {} }
        }
        // Subsequent calls fail
        throw new Error('error accessing db')
      }
    }
    const collectionSpy = vi.spyOn(mockDb, 'collection')

    const repositoryFactory = await createSystemLogsRepository(mockDb)
    const repository = repositoryFactory(mockLogger)

    const payload = {
      createdAt: new Date(),
      event: { category: 'c', action: 'a' },
      context: { organisationId: randomUUID() }
    }

    await repository.insert(payload)

    expect(collectionSpy).toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalled()
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
          s.decorate('server', 'db', mongoClient.db('epr-backend'))
        }
      }
      await server.register(fakeMongoPlugin)
      await server.register(mongoSystemLogsRepositoryPlugin)

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
          const organisationId = 'org-123'
          await request.systemLogsRepository.insert({
            id: 'log-1',
            context: { organisationId },
            message: 'Test log entry',
            createdAt: new Date()
          })
          const results =
            await request.systemLogsRepository.findByOrganisationId(
              organisationId
            )
          return { count: results.length }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'POST', url: '/test' })
      const result = JSON.parse(response.payload)

      expect(result.count).toBe(1)
    })
  })
})

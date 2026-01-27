import { randomUUID } from 'node:crypto'
import Hapi from '@hapi/hapi'
import { describe, vi, expect, it as base } from 'vitest'
import { createInMemorySummaryLogsRepository } from './inmemory.js'
import { testSummaryLogsRepositoryContract } from './port.contract.js'
import { summaryLogFactory } from './contract/test-data.js'
import { waitForVersion } from './contract/test-helpers.js'
import { inMemorySummaryLogsRepositoryPlugin } from '#plugins/repositories/inmemory-summary-logs-repository-plugin.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  summaryLogsRepositoryFactory: async ({}, use) => {
    const factory = createInMemorySummaryLogsRepository()
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

describe('In-memory summary logs repository', () => {
  describe('summary logs repository contract', () => {
    testSummaryLogsRepositoryContract(it)
  })

  describe('data isolation', () => {
    it('returns independent copies that cannot modify stored data', async () => {
      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = createInMemorySummaryLogsRepository()
      const repository = repositoryFactory(mockLogger)
      const id = `isolation-test-${randomUUID()}`

      await repository.insert(
        id,
        summaryLogFactory.validating({ file: { name: 'original.xlsx' } })
      )

      const retrieved = await repository.findById(id)
      retrieved.summaryLog.file.name = 'modified.xlsx'
      retrieved.summaryLog.file.uri = 's3://hacked-bucket/hacked-key'

      const retrievedAgain = await repository.findById(id)
      expect(retrievedAgain.summaryLog.file.name).toBe('original.xlsx')
      expect(retrievedAgain.summaryLog.file.uri).toBe(
        's3://test-bucket/test-key'
      )
    })

    it('stores independent copies that cannot be modified by input mutation', async () => {
      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = createInMemorySummaryLogsRepository()
      const repository = repositoryFactory(mockLogger)
      const id = `isolation-test-${randomUUID()}`
      const summaryLog = summaryLogFactory.validating({
        file: { name: 'original.xlsx' }
      })

      await repository.insert(id, summaryLog)

      summaryLog.file.name = 'mutated.xlsx'
      summaryLog.file.uri = 's3://mutated-bucket/mutated-key'

      const retrieved = await repository.findById(id)
      expect(retrieved.summaryLog.file.name).toBe('original.xlsx')
      expect(retrieved.summaryLog.file.uri).toBe('s3://test-bucket/test-key')
    })

    it('stores independent copies on update', async () => {
      const mockLogger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() }
      const repositoryFactory = createInMemorySummaryLogsRepository()
      const repository = repositoryFactory(mockLogger)
      const id = `isolation-test-${randomUUID()}`

      await repository.insert(id, summaryLogFactory.validating())

      const updates = summaryLogFactory.validated({
        file: { name: 'updated.xlsx' }
      })
      await repository.update(id, 1, updates)

      updates.file.name = 'mutated.xlsx'
      updates.file.uri = 's3://evil-bucket/evil-key'

      const retrieved = await waitForVersion(repository, id, 2)
      expect(retrieved.summaryLog.file.name).toBe('updated.xlsx')
      expect(retrieved.summaryLog.file.uri).toBe('s3://test-bucket/test-key')
    })
  })

  describe('plugin wiring', () => {
    it('makes repository available on request via plugin', async () => {
      const server = Hapi.server()
      await server.register(inMemorySummaryLogsRepositoryPlugin)

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

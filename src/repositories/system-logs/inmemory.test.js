import Hapi from '@hapi/hapi'
import { describe, expect, it as base } from 'vitest'
import { createSystemLogsRepository } from './inmemory.js'
import { testSystemLogsRepositoryContract } from './port.contract.js'
import { createInMemorySystemLogsRepositoryPlugin } from './inmemory.plugin.js'

const it = base.extend({
  // eslint-disable-next-line no-empty-pattern
  systemLogsRepository: async ({}, use) => {
    const factory = () => createSystemLogsRepository()(null)
    await use(factory)
  }
})

describe('In memory system logs repository', () => {
  it('should create repository instance', async ({ systemLogsRepository }) => {
    const repository = systemLogsRepository()
    expect(repository).toBeDefined()
  })

  describe('system logs repository contract', () => {
    testSystemLogsRepositoryContract(it)
  })

  describe('plugin wiring', () => {
    it('makes repository available on request via plugin', async () => {
      const server = Hapi.server()
      const plugin = createInMemorySystemLogsRepositoryPlugin()
      await server.register(plugin)

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

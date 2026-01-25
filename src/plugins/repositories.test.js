import { describe, it, expect, beforeEach, vi } from 'vitest'
import { repositories } from './repositories.js'

describe('repositories plugin', () => {
  let server
  let mockLogger

  beforeEach(async () => {
    const { default: Hapi } = await import('@hapi/hapi')
    server = Hapi.server()

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }
  })

  describe('lazy initialization and caching', () => {
    it('creates repository on first access and caches it for subsequent accesses (in the same request)', async () => {
      const mockFactory = vi.fn(() => ({ findAll: vi.fn() }))
      await server.register({
        plugin: repositories.plugin,
        options: {
          summaryLogsRepository: mockFactory,
          organisationsRepository: vi.fn(() => ({ findAll: vi.fn() })),
          formSubmissionsRepository: vi.fn(() => ({ findAll: vi.fn() })),
          systemLogsRepository: vi.fn(() => ({ findAll: vi.fn() })),
          wasteRecordsRepository: vi.fn(() => ({ findAll: vi.fn() })),
          wasteBalancesRepository: vi.fn(() => ({ findAll: vi.fn() })),
          publicRegisterRepository: vi.fn(() => ({ save: vi.fn() }))
        }
      })

      server.ext('onRequest', (request, h) => {
        request.logger = mockLogger
        return h.continue
      })

      server.route({
        method: 'GET',
        path: '/test',
        handler: (request) => {
          const first = request.summaryLogsRepository
          const second = request.summaryLogsRepository
          return { same: first === second }
        }
      })

      await server.initialize()
      const response = await server.inject({ method: 'GET', url: '/test' })

      expect(mockFactory).toHaveBeenCalledTimes(1)
      expect(mockFactory).toHaveBeenCalledWith(mockLogger)
      expect(JSON.parse(response.payload).same).toBe(true)
    })

    it('creates separate repository instances for different requests', async () => {
      const mockFactory = vi.fn(() => ({ id: Math.random() }))

      await server.register({
        plugin: repositories.plugin,
        options: {
          organisationsRepository: mockFactory,
          summaryLogsRepository: vi.fn(() => ({ findAll: vi.fn() })),
          formSubmissionsRepository: vi.fn(() => ({ findAll: vi.fn() })),
          systemLogsRepository: vi.fn(() => ({ findAll: vi.fn() })),
          wasteRecordsRepository: vi.fn(() => ({ findAll: vi.fn() })),
          wasteBalancesRepository: vi.fn(() => ({ findAll: vi.fn() })),
          publicRegisterRepository: vi.fn(() => ({ save: vi.fn() }))
        }
      })

      server.ext('onRequest', (request, h) => {
        request.logger = mockLogger
        return h.continue
      })

      server.route({
        method: 'GET',
        path: '/test',
        handler: (request) => ({ id: request.organisationsRepository.id })
      })

      await server.initialize()

      const response1 = await server.inject({ method: 'GET', url: '/test' })
      const response2 = await server.inject({ method: 'GET', url: '/test' })

      expect(mockFactory).toHaveBeenCalledTimes(2)
      expect(JSON.parse(response1.payload).id).not.toBe(
        JSON.parse(response2.payload).id
      )
    })

    it('creates the Packaging Recycling Note repository when flagged', async () => {
      server.decorate('server', 'featureFlags', {
        isCreatePackagingRecyclingNotesEnabled: () => true
      })

      await server.register({
        plugin: repositories.plugin,
        options: {
          organisationsRepository: vi.fn(),
          summaryLogsRepository: vi.fn(),
          formSubmissionsRepository: vi.fn(),
          systemLogsRepository: vi.fn(),
          wasteRecordsRepository: vi.fn(),
          wasteBalancesRepository: vi.fn(),
          publicRegisterRepository: vi.fn(() => ({ save: vi.fn() })),
          packagingRecyclingNotesRepository: vi.fn(() => ({ enabled: true }))
        }
      })

      server.ext('onRequest', (request, h) => {
        request.logger = mockLogger
        return h.continue
      })

      server.route({
        method: 'GET',
        path: '/test',
        handler: (request) => request.packagingRecyclingNotesRepository
      })

      await server.initialize()

      const { payload } = await server.inject({ method: 'GET', url: '/test' })

      expect(JSON.parse(payload)).toEqual({ enabled: true })
    })
  })
})

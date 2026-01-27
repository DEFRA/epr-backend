import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockWorkersPlugin } from './mock-workers-plugin.js'

describe('mockWorkersPlugin', () => {
  let server
  let mockLogger

  beforeEach(async () => {
    vi.clearAllMocks()

    const { default: Hapi } = await import('@hapi/hapi')
    server = Hapi.server()

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }

    server.decorate('server', 'logger', mockLogger)
  })

  it('has the correct plugin name', () => {
    expect(mockWorkersPlugin.name).toBe('workers')
  })

  it('has no dependencies', () => {
    expect(mockWorkersPlugin.dependencies).toBeUndefined()
  })

  describe('when mock worker is provided via options', () => {
    it('uses the provided mock worker directly', async () => {
      const mockWorker = { validate: vi.fn(), submit: vi.fn() }

      await server.register({
        plugin: mockWorkersPlugin,
        options: { summaryLogsWorker: mockWorker }
      })

      server.route({
        method: 'GET',
        path: '/test',
        handler: (request) => ({ hasWorker: !!request.summaryLogsWorker })
      })

      await server.initialize()
      const response = await server.inject({ method: 'GET', url: '/test' })

      expect(JSON.parse(response.payload).hasWorker).toBe(true)
    })

    it('returns the same mock worker instance for each request', async () => {
      const mockWorker = { validate: vi.fn(), submit: vi.fn(), id: 'test-123' }

      await server.register({
        plugin: mockWorkersPlugin,
        options: { summaryLogsWorker: mockWorker }
      })

      server.route({
        method: 'GET',
        path: '/test',
        handler: (request) => ({ id: request.summaryLogsWorker.id })
      })

      await server.initialize()
      const response = await server.inject({ method: 'GET', url: '/test' })

      expect(JSON.parse(response.payload).id).toBe('test-123')
    })

    it('allows tests to verify worker methods were called', async () => {
      const mockWorker = { validate: vi.fn(), submit: vi.fn() }

      await server.register({
        plugin: mockWorkersPlugin,
        options: { summaryLogsWorker: mockWorker }
      })

      server.route({
        method: 'POST',
        path: '/validate/{id}',
        handler: async (request) => {
          await request.summaryLogsWorker.validate(request.params.id)
          return { validated: true }
        }
      })

      await server.initialize()
      await server.inject({ method: 'POST', url: '/validate/summary-123' })

      expect(mockWorker.validate).toHaveBeenCalledWith('summary-123')
    })
  })

  describe('when no mock worker is provided', () => {
    it('creates a no-op worker', async () => {
      await server.register({ plugin: mockWorkersPlugin })

      server.route({
        method: 'GET',
        path: '/test',
        handler: (request) => ({
          hasWorker: !!request.summaryLogsWorker,
          hasValidate: typeof request.summaryLogsWorker.validate === 'function',
          hasSubmit: typeof request.summaryLogsWorker.submit === 'function'
        })
      })

      await server.initialize()
      const response = await server.inject({ method: 'GET', url: '/test' })
      const payload = JSON.parse(response.payload)

      expect(payload.hasWorker).toBe(true)
      expect(payload.hasValidate).toBe(true)
      expect(payload.hasSubmit).toBe(true)
    })

    it('no-op worker methods do nothing', async () => {
      await server.register({ plugin: mockWorkersPlugin })

      server.route({
        method: 'POST',
        path: '/validate/{id}',
        handler: async (request) => {
          await request.summaryLogsWorker.validate(request.params.id)
          await request.summaryLogsWorker.submit(request.params.id)
          return { ok: true }
        }
      })

      await server.initialize()
      const response = await server.inject({
        method: 'POST',
        url: '/validate/summary-123'
      })

      expect(response.statusCode).toBe(200)
      expect(JSON.parse(response.payload).ok).toBe(true)
    })
  })
})

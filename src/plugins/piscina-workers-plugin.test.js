import { describe, it, expect, beforeEach, vi } from 'vitest'
import { piscinaWorkersPlugin } from './piscina-workers-plugin.js'

vi.mock('#adapters/validators/summary-logs/piscina.js', () => ({
  closeWorkerPool: vi.fn(),
  createSummaryLogsCommandExecutor: vi.fn(() => ({
    validate: vi.fn(),
    submit: vi.fn()
  }))
}))

vi.mock('#repositories/summary-logs/mongodb.js', () => ({
  createSummaryLogsRepository: vi.fn(() => vi.fn(() => ({ findById: vi.fn() })))
}))

describe('piscinaWorkersPlugin', () => {
  let server
  let mockLogger
  let mockDb

  beforeEach(async () => {
    vi.clearAllMocks()

    const { default: Hapi } = await import('@hapi/hapi')
    server = Hapi.server()

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn()
    }

    mockDb = { collection: vi.fn() }

    server.decorate('server', 'logger', mockLogger)
  })

  it('has the correct plugin name', () => {
    expect(piscinaWorkersPlugin.name).toBe('workers')
  })

  it('declares mongodb as a dependency', () => {
    expect(piscinaWorkersPlugin.dependencies).toEqual(['mongodb'])
  })

  describe('when registered with mongodb', () => {
    beforeEach(async () => {
      // Register a mock mongodb plugin
      await server.register({
        plugin: {
          name: 'mongodb',
          register: (srv) => {
            srv.decorate('server', 'db', mockDb)
          }
        }
      })
    })

    it('creates worker with repository', async () => {
      const { createSummaryLogsCommandExecutor } =
        await import('#adapters/validators/summary-logs/piscina.js')
      const { createSummaryLogsRepository } =
        await import('#repositories/summary-logs/mongodb.js')

      await server.register({ plugin: piscinaWorkersPlugin })

      server.route({
        method: 'GET',
        path: '/test',
        handler: (request) => ({ hasWorker: !!request.summaryLogsWorker })
      })

      await server.initialize()
      const response = await server.inject({ method: 'GET', url: '/test' })

      expect(JSON.parse(response.payload).hasWorker).toBe(true)
      expect(createSummaryLogsRepository).toHaveBeenCalledWith(mockDb)
      expect(createSummaryLogsCommandExecutor).toHaveBeenCalledWith(
        mockLogger,
        expect.any(Object)
      )
    })

    it('exposes the same worker instance for each request', async () => {
      await server.register({ plugin: piscinaWorkersPlugin })

      let firstWorker
      let secondWorker

      server.route({
        method: 'GET',
        path: '/first',
        handler: (request) => {
          firstWorker = request.summaryLogsWorker
          return { ok: true }
        }
      })

      server.route({
        method: 'GET',
        path: '/second',
        handler: (request) => {
          secondWorker = request.summaryLogsWorker
          return { ok: true }
        }
      })

      await server.initialize()
      await server.inject({ method: 'GET', url: '/first' })
      await server.inject({ method: 'GET', url: '/second' })

      expect(firstWorker).toBe(secondWorker)
    })
  })

  describe('server stop event', () => {
    beforeEach(async () => {
      await server.register({
        plugin: {
          name: 'mongodb',
          register: (srv) => {
            srv.decorate('server', 'db', mockDb)
          }
        }
      })
    })

    it('closes worker pool on server stop', async () => {
      const { closeWorkerPool } =
        await import('#adapters/validators/summary-logs/piscina.js')

      await server.register({ plugin: piscinaWorkersPlugin })

      await server.initialize()
      await server.stop()

      expect(closeWorkerPool).toHaveBeenCalled()
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Closing worker pool'
        })
      )
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Closed worker pool'
        })
      )
    })

    it('logs error when closeWorkerPool fails', async () => {
      const { closeWorkerPool } =
        await import('#adapters/validators/summary-logs/piscina.js')

      const testError = new Error('Pool close failed')
      closeWorkerPool.mockRejectedValueOnce(testError)

      await server.register({ plugin: piscinaWorkersPlugin })

      await server.initialize()
      await server.stop()

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: testError,
          message: 'Failed to close worker pool'
        })
      )
    })
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { workers } from './workers.js'

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

describe('workers plugin', () => {
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

  describe('when mock worker is provided via options', () => {
    it('uses the provided mock worker directly', async () => {
      const mockWorker = { validate: vi.fn(), submit: vi.fn() }

      await server.register({
        plugin: workers.plugin,
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
        plugin: workers.plugin,
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
  })

  describe('when mongodb is not registered', () => {
    it('creates worker without repository', async () => {
      const { createSummaryLogsCommandExecutor } =
        await import('#adapters/validators/summary-logs/piscina.js')

      await server.register({
        plugin: workers.plugin
      })

      server.route({
        method: 'GET',
        path: '/test',
        handler: (request) => ({ hasWorker: !!request.summaryLogsWorker })
      })

      await server.initialize()
      const response = await server.inject({ method: 'GET', url: '/test' })

      expect(JSON.parse(response.payload).hasWorker).toBe(true)
      expect(createSummaryLogsCommandExecutor).toHaveBeenCalledWith(mockLogger)
      expect(createSummaryLogsCommandExecutor).toHaveBeenCalledTimes(1)
    })
  })

  describe('when mongodb is registered', () => {
    it('creates worker with repository after mongodb is available', async () => {
      const { createSummaryLogsCommandExecutor } =
        await import('#adapters/validators/summary-logs/piscina.js')
      const { createSummaryLogsRepository } =
        await import('#repositories/summary-logs/mongodb.js')

      const mockDb = { collection: vi.fn() }

      // Register a mock mongodb plugin
      await server.register({
        plugin: {
          name: 'mongodb',
          register: (srv) => {
            srv.decorate('server', 'db', mockDb)
          }
        }
      })

      await server.register({
        plugin: workers.plugin
      })

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
  })

  describe('server stop event', () => {
    it('closes worker pool on server stop', async () => {
      const { closeWorkerPool } =
        await import('#adapters/validators/summary-logs/piscina.js')

      await server.register({
        plugin: workers.plugin
      })

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

      await server.register({
        plugin: workers.plugin
      })

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

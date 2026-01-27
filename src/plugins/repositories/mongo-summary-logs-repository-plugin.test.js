import Hapi from '@hapi/hapi'
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'
import { mongoSummaryLogsRepositoryPlugin } from './mongo-summary-logs-repository-plugin.js'

const mockLoggerPlugin = {
  name: 'mockLogger',
  register: (server) => {
    server.ext('onRequest', (request, h) => {
      request.logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
      }
      return h.continue
    })
  }
}

describe('mongoSummaryLogsRepositoryPlugin', () => {
  /** @type {import('@hapi/hapi').Server} */
  let server
  let mockDb

  beforeEach(async () => {
    mockDb = {
      collection: vi.fn(() => ({
        createIndex: vi.fn(),
        findOne: vi.fn(),
        insertOne: vi.fn(),
        updateOne: vi.fn(() => ({ matchedCount: 1 })),
        findOneAndUpdate: vi.fn()
      }))
    }

    server = Hapi.server()

    const fakeMongoDbPlugin = {
      name: 'mongodb',
      register: (srv) => {
        srv.decorate('server', 'db', mockDb)
      }
    }

    await server.register([
      mockLoggerPlugin,
      fakeMongoDbPlugin,
      mongoSummaryLogsRepositoryPlugin
    ])

    server.route({
      method: 'GET',
      path: '/test',
      handler: (request) => {
        return {
          hasSummaryLogsRepository: request.summaryLogsRepository !== undefined,
          hasInsert:
            typeof request.summaryLogsRepository?.insert === 'function',
          hasFindById:
            typeof request.summaryLogsRepository?.findById === 'function',
          hasUpdate: typeof request.summaryLogsRepository?.update === 'function'
        }
      }
    })

    await server.initialize()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('has plugin name "summaryLogsRepository"', () => {
    expect(mongoSummaryLogsRepositoryPlugin.name).toBe('summaryLogsRepository')
  })

  test('declares mongodb as a dependency', () => {
    expect(mongoSummaryLogsRepositoryPlugin.dependencies).toContain('mongodb')
  })

  test('provides summaryLogsRepository directly on request object', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/test'
    })

    const payload = JSON.parse(response.payload)
    expect(payload.hasSummaryLogsRepository).toBe(true)
    expect(payload.hasInsert).toBe(true)
    expect(payload.hasFindById).toBe(true)
    expect(payload.hasUpdate).toBe(true)
  })

  test('caches repository instance within a request', async () => {
    server.route({
      method: 'GET',
      path: '/test-caching',
      handler: (request) => {
        const first = request.summaryLogsRepository
        const second = request.summaryLogsRepository
        return { sameInstance: first === second }
      }
    })

    const response = await server.inject({
      method: 'GET',
      url: '/test-caching'
    })

    const payload = JSON.parse(response.payload)
    expect(payload.sameInstance).toBe(true)
  })

  test('creates new repository instance for each request', async () => {
    const instances = []

    server.route({
      method: 'GET',
      path: '/test-per-request',
      handler: (request) => {
        instances.push(request.summaryLogsRepository)
        return { ok: true }
      }
    })

    await server.inject({ method: 'GET', url: '/test-per-request' })
    await server.inject({ method: 'GET', url: '/test-per-request' })

    expect(instances).toHaveLength(2)
    expect(instances[0]).not.toBe(instances[1])
  })
})

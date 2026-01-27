import Hapi from '@hapi/hapi'
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'
import { inMemorySummaryLogsRepositoryPlugin } from './inmemory-summary-logs-repository-plugin.js'

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

describe('inMemorySummaryLogsRepositoryPlugin', () => {
  /** @type {import('@hapi/hapi').Server} */
  let server

  beforeEach(async () => {
    server = Hapi.server()

    await server.register([
      mockLoggerPlugin,
      inMemorySummaryLogsRepositoryPlugin
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
    expect(inMemorySummaryLogsRepositoryPlugin.name).toBe(
      'summaryLogsRepository'
    )
  })

  test('has no dependencies', () => {
    expect(inMemorySummaryLogsRepositoryPlugin.dependencies).toBeUndefined()
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

  test('repository is functional', async () => {
    server.route({
      method: 'POST',
      path: '/test-insert',
      handler: async (request) => {
        const id = 'test-log-123'
        // Use preprocessing status which doesn't require file
        const summaryLog = {
          status: 'preprocessing',
          expiresAt: new Date(Date.now() + 3600000),
          organisationId: 'org-123',
          registrationId: 'reg-456'
        }
        await request.summaryLogsRepository.insert(id, summaryLog)
        const found = await request.summaryLogsRepository.findById(id)
        return { inserted: true, foundVersion: found?.version }
      }
    })

    const response = await server.inject({
      method: 'POST',
      url: '/test-insert'
    })

    expect(response.statusCode).toBe(200)
    const payload = JSON.parse(response.payload)
    expect(payload.inserted).toBe(true)
    expect(payload.foundVersion).toBe(1)
  })
})

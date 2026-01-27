import Hapi from '@hapi/hapi'
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'
import { mongoOrganisationsRepositoryPlugin } from './mongo-organisations-repository-plugin.js'

describe('mongoOrganisationsRepositoryPlugin', () => {
  /** @type {import('@hapi/hapi').Server} */
  let server
  let mockDb

  beforeEach(async () => {
    mockDb = {
      collection: vi.fn(() => ({
        createIndex: vi.fn(),
        findOne: vi.fn(),
        find: vi.fn(() => ({ toArray: vi.fn(() => []) })),
        insertOne: vi.fn(),
        replaceOne: vi.fn(),
        aggregate: vi.fn(() => ({ toArray: vi.fn(() => []) }))
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
      fakeMongoDbPlugin,
      mongoOrganisationsRepositoryPlugin
    ])

    server.route({
      method: 'GET',
      path: '/test',
      handler: (request) => {
        return {
          hasOrganisationsRepository:
            request.organisationsRepository !== undefined,
          hasInsert:
            typeof request.organisationsRepository?.insert === 'function',
          hasFindById:
            typeof request.organisationsRepository?.findById === 'function',
          hasFindAll:
            typeof request.organisationsRepository?.findAll === 'function'
        }
      }
    })

    await server.initialize()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  test('has plugin name "organisationsRepository"', () => {
    expect(mongoOrganisationsRepositoryPlugin.name).toBe(
      'organisationsRepository'
    )
  })

  test('declares mongodb as a dependency', () => {
    expect(mongoOrganisationsRepositoryPlugin.dependencies).toContain('mongodb')
  })

  test('provides organisationsRepository directly on request object', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/test'
    })

    const payload = JSON.parse(response.payload)
    expect(payload.hasOrganisationsRepository).toBe(true)
    expect(payload.hasInsert).toBe(true)
    expect(payload.hasFindById).toBe(true)
    expect(payload.hasFindAll).toBe(true)
  })

  test('returns same repository instance across multiple accesses', async () => {
    server.route({
      method: 'GET',
      path: '/test-identity',
      handler: (request) => {
        const first = request.organisationsRepository
        const second = request.organisationsRepository
        return { sameInstance: first === second }
      }
    })

    const response = await server.inject({
      method: 'GET',
      url: '/test-identity'
    })

    const payload = JSON.parse(response.payload)
    expect(payload.sameInstance).toBe(true)
  })
})

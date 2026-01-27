import Hapi from '@hapi/hapi'
import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest'
import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { inMemoryOrganisationsRepositoryPlugin } from './inmemory-organisations-repository-plugin.js'

describe('inMemoryOrganisationsRepositoryPlugin', () => {
  /** @type {import('@hapi/hapi').Server} */
  let server

  beforeEach(async () => {
    server = Hapi.server()

    await server.register(inMemoryOrganisationsRepositoryPlugin)

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
    expect(inMemoryOrganisationsRepositoryPlugin.name).toBe(
      'organisationsRepository'
    )
  })

  test('has no dependencies', () => {
    expect(inMemoryOrganisationsRepositoryPlugin.dependencies).toBeUndefined()
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

  test('repository is functional', async () => {
    server.route({
      method: 'POST',
      path: '/test-insert',
      handler: async (request) => {
        const org = buildOrganisation()
        await request.organisationsRepository.insert(org)
        const found = await request.organisationsRepository.findById(org.id)
        return { inserted: true, foundId: found.id }
      }
    })

    const response = await server.inject({
      method: 'POST',
      url: '/test-insert'
    })

    const payload = JSON.parse(response.payload)
    expect(payload.inserted).toBe(true)
    expect(payload.foundId).toBeDefined()
  })

  test('accepts initialOrganisations option', async () => {
    const testServer = Hapi.server()
    const org = buildOrganisation()

    await testServer.register({
      plugin: inMemoryOrganisationsRepositoryPlugin,
      options: { initialOrganisations: [org] }
    })

    testServer.route({
      method: 'GET',
      path: '/test-initial',
      handler: async (request) => {
        const found = await request.organisationsRepository.findAll()
        return { count: found.length }
      }
    })

    await testServer.initialize()

    const response = await testServer.inject({
      method: 'GET',
      url: '/test-initial'
    })

    const payload = JSON.parse(response.payload)
    expect(payload.count).toBe(1)
  })
})

import Hapi from '@hapi/hapi'
import { describe, it, expect } from 'vitest'
import { repositories } from '#plugins/repositories.js'

// Minimal fake mongodb plugin to satisfy dependency and provide a stub db
const createFakeMongoPlugin = (db = {}) => ({
  plugin: {
    name: 'mongodb',
    version: '1.0.0',
    async register(server) {
      server.decorate('server', 'db', db)
      // Mirror request decoration shape used by real plugin (not required by repositories, but harmless)
      server.decorate('request', 'db', () => db, { apply: true })
    }
  }
})

describe('repositories plugin', () => {
  it('decorates request with repositories from overrides when provided (no mongodb dependency)', async () => {
    const server = Hapi.server()

    const summaryLogsRepository = { name: 'summaryLogsRepoOverride' }
    const organisationsRepository = { name: 'organisationsRepoOverride' }

    await server.register({
      plugin: repositories,
      options: {
        summaryLogsRepository,
        organisationsRepository
      }
    })

    // Define a simple route to inspect request decorations
    server.route({
      method: 'GET',
      path: '/test',
      handler: (request, h) => {
        return h.response({
          summaryIsOverride:
            request.summaryLogsRepository === summaryLogsRepository,
          organisationsIsOverride:
            request.organisationsRepository === organisationsRepository
        })
      }
    })

    await server.initialize()

    const res = await server.inject({ method: 'GET', url: '/test' })
    expect(res.statusCode).toBe(200)
    const body = res.result
    expect(body).toEqual({
      summaryIsOverride: true,
      organisationsIsOverride: true
    })

    await server.stop()
  })

  it('creates missing repositories after mongodb dependency is registered (partial override)', async () => {
    const server = Hapi.server()

    const summaryLogsRepository = { name: 'summaryLogsRepoOverride' }

    // Register repositories first with only one override; it declares dependency on mongodb
    await server.register({
      plugin: repositories,
      options: { summaryLogsRepository }
    })

    // Register fake mongodb to satisfy dependency and provide a stub db
    await server.register(createFakeMongoPlugin({}))

    server.route({
      method: 'GET',
      path: '/test',
      handler: (request, h) => {
        return h.response({
          summaryIsOverride:
            request.summaryLogsRepository === summaryLogsRepository,
          organisationsExists:
            request.organisationsRepository &&
            typeof request.organisationsRepository.findAll === 'function'
        })
      }
    })

    await server.initialize()

    const res = await server.inject({ method: 'GET', url: '/test' })
    expect(res.statusCode).toBe(200)
    const body = res.result
    expect(body.summaryIsOverride).toBe(true)
    expect(body.organisationsExists).toBe(true)

    await server.stop()
  })

  it('creates all repositories from factories when no overrides are provided', async () => {
    const server = Hapi.server()

    await server.register({ plugin: repositories })
    await server.register(createFakeMongoPlugin({}))

    server.route({
      method: 'GET',
      path: '/test',
      handler: (request, h) => {
        const { summaryLogsRepository, organisationsRepository } = request
        return h.response({
          hasSummary:
            !!summaryLogsRepository &&
            typeof summaryLogsRepository === 'object' &&
            typeof summaryLogsRepository.insert === 'function' &&
            typeof summaryLogsRepository.update === 'function' &&
            typeof summaryLogsRepository.findById === 'function' &&
            typeof summaryLogsRepository.updateStatus === 'function',
          hasOrganisations:
            !!organisationsRepository &&
            typeof organisationsRepository === 'object' &&
            typeof organisationsRepository.findAll === 'function'
        })
      }
    })

    await server.initialize()

    const res = await server.inject({ method: 'GET', url: '/test' })
    expect(res.statusCode).toBe(200)
    const body = res.result
    expect(body.hasSummary).toBe(true)
    expect(body.hasOrganisations).toBe(true)

    await server.stop()
  })
})

import { describe, it, expect, beforeEach, vi } from 'vitest'
import Boom from '@hapi/boom'
import { boomResponseLogger } from './boom-response-logger.js'

const makeServer = async (routes = []) => {
  const { default: Hapi } = await import('@hapi/hapi')
  const server = Hapi.server()
  const mockLogger = { warn: vi.fn(), error: vi.fn() }

  server.ext('onRequest', (request, h) => {
    request.logger = mockLogger
    return h.continue
  })

  await server.register({ plugin: boomResponseLogger.plugin })
  server.route(routes)
  await server.initialize()
  return { server, mockLogger }
}

describe('boom-response-logger plugin', () => {
  let server
  let mockLogger

  beforeEach(async () => {
    const built = await makeServer([
      {
        method: 'GET',
        path: '/ok',
        handler: (_request, h) => h.response({ ok: true })
      },
      {
        method: 'GET',
        path: '/plain-4xx',
        handler: () => {
          throw Boom.badRequest('plain error')
        }
      },
      {
        method: 'GET',
        path: '/enriched-4xx',
        handler: () => {
          const boom = Boom.badRequest('Something invalid')
          boom.code = 'SOMETHING_INVALID'
          boom.event = {
            action: 'create_report',
            reason: 'foo=bar baz=qux',
            reference: 'reg-123'
          }
          throw boom
        }
      },
      {
        method: 'GET',
        path: '/5xx',
        handler: () => {
          throw Boom.badImplementation('blown up')
        }
      },
      {
        method: 'GET',
        path: '/401',
        handler: () => {
          throw Boom.unauthorized('no token')
        }
      }
    ])
    server = built.server
    mockLogger = built.mockLogger
  })

  it('does not log for non-boom responses', async () => {
    await server.inject({ method: 'GET', url: '/ok' })

    expect(mockLogger.warn).not.toHaveBeenCalled()
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('logs warn for a plain 4xx boom with default event fields', async () => {
    await server.inject({ method: 'GET', url: '/plain-4xx' })

    expect(mockLogger.warn).toHaveBeenCalledTimes(1)
    expect(mockLogger.warn).toHaveBeenCalledWith({
      message: 'plain error',
      err: expect.objectContaining({ isBoom: true }),
      event: {
        category: 'http',
        outcome: 'failure'
      }
    })
  })

  it('logs warn for an enriched 4xx boom with merged event fields', async () => {
    await server.inject({ method: 'GET', url: '/enriched-4xx' })

    expect(mockLogger.warn).toHaveBeenCalledTimes(1)
    expect(mockLogger.warn).toHaveBeenCalledWith({
      message: 'Something invalid',
      err: expect.objectContaining({
        isBoom: true,
        code: 'SOMETHING_INVALID'
      }),
      event: {
        category: 'http',
        outcome: 'failure',
        action: 'create_report',
        reason: 'foo=bar baz=qux',
        reference: 'reg-123'
      }
    })
  })

  it('logs error for a 5xx boom', async () => {
    await server.inject({ method: 'GET', url: '/5xx' })

    expect(mockLogger.error).toHaveBeenCalledTimes(1)
    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  it('skips 401 to avoid duplication with auth-failure-logger', async () => {
    await server.inject({ method: 'GET', url: '/401' })

    expect(mockLogger.warn).not.toHaveBeenCalled()
    expect(mockLogger.error).not.toHaveBeenCalled()
  })
})

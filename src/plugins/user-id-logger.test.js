import { describe, it, expect, beforeEach, vi } from 'vitest'
import { userIdLogger } from './user-id-logger.js'

describe('user-id-logger plugin', () => {
  let server
  let baseLogger
  let childLogger

  beforeEach(async () => {
    const { default: Hapi } = await import('@hapi/hapi')
    server = Hapi.server()

    childLogger = { info: vi.fn() }
    baseLogger = { info: vi.fn(), child: vi.fn(() => childLogger) }

    server.ext('onRequest', (request, h) => {
      request.logger = baseLogger
      return h.continue
    })

    server.auth.scheme('test-scheme', () => ({
      authenticate: (request, h) => {
        const authHeader = request.headers['x-auth-id']
        if (!authHeader) {
          return h.unauthenticated(new Error('no auth'))
        }
        return h.authenticated({ credentials: { id: authHeader } })
      }
    }))
    server.auth.strategy('test', 'test-scheme')

    await server.register({ plugin: userIdLogger.plugin })

    server.route([
      {
        method: 'GET',
        path: '/public',
        options: { auth: false },
        handler: (request) => {
          request.logger.info({ msg: 'public-handler' })
          return { ok: true }
        }
      },
      {
        method: 'GET',
        path: '/authed',
        options: { auth: 'test' },
        handler: (request) => {
          request.logger.info({ msg: 'authed-handler' })
          return { ok: true }
        }
      }
    ])

    await server.initialize()
  })

  it('wraps request-logger with user.id child binding when authenticated', async () => {
    await server.inject({
      method: 'GET',
      url: '/authed',
      headers: { 'x-auth-id': 'user-abc' }
    })

    expect(baseLogger.child).toHaveBeenCalledWith({ user: { id: 'user-abc' } })
    expect(childLogger.info).toHaveBeenCalledWith({ msg: 'authed-handler' })
    expect(baseLogger.info).not.toHaveBeenCalledWith({ msg: 'authed-handler' })
  })

  it('leaves request-logger untouched on unauthenticated routes', async () => {
    await server.inject({ method: 'GET', url: '/public' })

    expect(baseLogger.child).not.toHaveBeenCalled()
    expect(baseLogger.info).toHaveBeenCalledWith({ msg: 'public-handler' })
  })

  it('leaves request-logger untouched when credentials lack an id', async () => {
    server.auth.scheme('no-id-scheme', () => ({
      authenticate: (_request, h) =>
        h.authenticated({ credentials: { name: 'anon' } })
    }))
    server.auth.strategy('no-id', 'no-id-scheme')

    server.route({
      method: 'GET',
      path: '/no-id',
      options: { auth: 'no-id' },
      handler: (request) => {
        request.logger.info({ msg: 'no-id-handler' })
        return { ok: true }
      }
    })

    await server.inject({ method: 'GET', url: '/no-id' })

    expect(baseLogger.child).not.toHaveBeenCalled()
    expect(baseLogger.info).toHaveBeenCalledWith({ msg: 'no-id-handler' })
  })
})

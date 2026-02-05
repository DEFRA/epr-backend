import { describe, it, expect, beforeEach, vi } from 'vitest'
import Boom from '@hapi/boom'
import { authFailureLogger } from './auth-failure-logger.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'

describe('auth-failure-logger plugin', () => {
  let server
  let mockLogger

  beforeEach(async () => {
    const { default: Hapi } = await import('@hapi/hapi')
    server = Hapi.server()

    mockLogger = { warn: vi.fn() }

    server.ext('onRequest', (request, h) => {
      request.logger = mockLogger
      return h.continue
    })

    await server.register({ plugin: authFailureLogger.plugin })

    server.route([
      {
        method: 'GET',
        path: '/ok',
        handler: (_request, h) => h.response({ ok: true })
      },
      {
        method: 'GET',
        path: '/unauthorized',
        handler: () => {
          throw Boom.unauthorized('Invalid token')
        }
      },
      {
        method: 'GET',
        path: '/forbidden',
        handler: () => {
          throw Boom.forbidden()
        }
      }
    ])

    await server.initialize()
  })

  it('logs warning for 401 errors', async () => {
    await server.inject({ method: 'GET', url: '/unauthorized' })

    expect(mockLogger.warn).toHaveBeenCalledWith({
      message: 'Invalid token (path: /unauthorized, method: get)',
      err: expect.objectContaining({
        isBoom: true,
        output: expect.objectContaining({ statusCode: 401 })
      }),
      event: {
        category: LOGGING_EVENT_CATEGORIES.AUTH,
        action: LOGGING_EVENT_ACTIONS.AUTH_FAILED
      }
    })
  })

  it('does not log for successful responses', async () => {
    await server.inject({ method: 'GET', url: '/ok' })

    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  it('does not log for non-401 errors', async () => {
    await server.inject({ method: 'GET', url: '/forbidden' })

    expect(mockLogger.warn).not.toHaveBeenCalled()
  })
})

import Boom from '@hapi/boom'

import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { expectLogToBeCdpCompliant } from '#common/helpers/logging/log-schema.test-helper.js'

import { boomErrorLogger } from './boom-error-logger.js'

describe('boom-error-logger plugin', () => {
  let server
  let mockLogger

  beforeEach(async () => {
    const { default: Hapi } = await import('@hapi/hapi')
    server = Hapi.server()

    mockLogger = { warn: vi.fn(), error: vi.fn() }

    server.ext('onRequest', (request, h) => {
      request.logger = mockLogger
      return h.continue
    })

    await server.register({ plugin: boomErrorLogger.plugin })

    server.route([
      {
        method: 'GET',
        path: '/ok',
        handler: (_request, h) => h.response({ ok: true })
      },
      {
        method: 'GET',
        path: '/bad-request',
        handler: () => {
          throw Boom.badRequest('Validation failed')
        }
      },
      {
        method: 'GET',
        path: '/not-found',
        handler: () => {
          throw Boom.notFound('Resource missing')
        }
      },
      {
        method: 'GET',
        path: '/unauthorized',
        handler: () => {
          throw Boom.unauthorized('Bad token')
        }
      },
      {
        method: 'GET',
        path: '/internal',
        handler: () => {
          throw Boom.internal('Database died')
        }
      },
      {
        method: 'GET',
        path: '/enriched',
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
      }
    ])

    await server.initialize()
  })

  it('warns for 4xx Boom errors with PII-safe ECS error fields', async () => {
    await server.inject({ method: 'GET', url: '/bad-request' })

    expect(mockLogger.warn).toHaveBeenCalledWith({
      message: 'Validation failed',
      error: {
        code: '400',
        id: expect.any(String),
        message: 'Validation failed',
        type: 'Bad Request'
      },
      event: {
        category: LOGGING_EVENT_CATEGORIES.HTTP,
        action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE,
        kind: 'event',
        outcome: 'failure'
      },
      http: { response: { status_code: 400 } }
    })
  })

  it('does not log stack_trace (the first line can leak PII from upstream errors)', async () => {
    await server.inject({ method: 'GET', url: '/bad-request' })

    const logCall = mockLogger.warn.mock.calls[0][0]
    expect(logCall.error).not.toHaveProperty('stack_trace')
  })

  it('uses the standard HTTP class string as error.type for 404', async () => {
    await server.inject({ method: 'GET', url: '/not-found' })

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: '404',
          type: 'Not Found',
          message: 'Resource missing'
        })
      })
    )
  })

  it('errors for 5xx Boom errors with response_failure action', async () => {
    await server.inject({ method: 'GET', url: '/internal' })

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          code: '500',
          type: 'Internal Server Error'
        }),
        event: expect.objectContaining({
          action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE,
          outcome: 'failure'
        }),
        http: { response: { status_code: 500 } }
      })
    )
  })

  it('populates error.id from the Hapi request id', async () => {
    await server.inject({ method: 'GET', url: '/bad-request' })

    const logCall = mockLogger.warn.mock.calls[0][0]
    expect(logCall.error.id).toBeTruthy()
    expect(typeof logCall.error.id).toBe('string')
  })

  it('skips 401 to avoid duplication with authFailureLogger', async () => {
    await server.inject({ method: 'GET', url: '/unauthorized' })

    expect(mockLogger.warn).not.toHaveBeenCalled()
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('does not log for successful responses', async () => {
    await server.inject({ method: 'GET', url: '/ok' })

    expect(mockLogger.warn).not.toHaveBeenCalled()
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('uses boom.code as error.code when set by a helper', async () => {
    await server.inject({ method: 'GET', url: '/enriched' })

    expect(mockLogger.warn).toHaveBeenCalledWith({
      message: 'Something invalid',
      error: {
        code: 'SOMETHING_INVALID',
        id: expect.any(String),
        message: 'Something invalid',
        type: 'Bad Request'
      },
      event: {
        category: LOGGING_EVENT_CATEGORIES.HTTP,
        action: 'create_report',
        kind: 'event',
        outcome: 'failure',
        reason: 'foo=bar baz=qux',
        reference: 'reg-123'
      },
      http: { response: { status_code: 400 } }
    })
  })

  it.each([
    { url: '/bad-request', level: 'warn' },
    { url: '/not-found', level: 'warn' },
    { url: '/internal', level: 'error' },
    { url: '/enriched', level: 'warn' }
  ])(
    'should emit a CDP-compliant log shape for $url',
    async ({ url, level }) => {
      await server.inject({ method: 'GET', url })
      const logged = mockLogger[level].mock.calls[0][0]

      expect(logged).toBeDefined()
      expectLogToBeCdpCompliant(logged)
    }
  )
})

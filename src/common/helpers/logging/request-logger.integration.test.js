import pino from 'pino'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { logger } from './logger.js'
import { loggerOptions } from './logger-options.js'
import { config } from '#root/config.js'
import { createLogCaptureServer } from '#test/log-capture-server.js'

describe('request-logger integration (hapi-pino + pino + ecs format)', () => {
  afterEach(() => {
    config.reset('cdpEnvironment')
  })

  it('should emit a canonical IndexedLogProperties payload through hapi-pino unchanged', async () => {
    config.set('cdpEnvironment', 'dev')
    const { server, findLine } = await createLogCaptureServer()
    server.route({
      method: 'GET',
      path: '/test',
      handler: (request) => {
        request.logger.info({
          message: 'test event',
          event: { action: 'test_event' }
        })
        return 'ok'
      }
    })

    await server.inject('/test')
    const out = findLine((l) => l.message === 'test event')

    expect(out).toMatchObject({
      message: 'test event',
      event: { action: 'test_event' },
      'log.level': 'info'
    })
  })

  it('should bind ECS http.* and url.* on the per-request child logger (no flat req)', async () => {
    config.set('cdpEnvironment', 'dev')
    const { server, findLine } = await createLogCaptureServer()
    server.route({
      method: 'GET',
      path: '/test',
      handler: (request) => {
        request.logger.info({ message: 'handler entered' })
        return 'ok'
      }
    })

    await server.inject('/test')
    const out = findLine((l) => l.message === 'handler entered')

    expect(out).toMatchObject({
      http: { request: { method: 'GET' } },
      url: { path: '/test' }
    })
    expect(out.http.request.id).toStrictEqual(expect.any(String))
    expect(out).not.toHaveProperty('req')
  })

  it('should emit ECS http.response.* and url.path on the hapi-pino response auto-log', async () => {
    config.set('cdpEnvironment', 'dev')
    const { server, findLine } = await createLogCaptureServer()
    server.route({
      method: 'GET',
      path: '/test',
      handler: () => 'ok'
    })

    await server.inject('/test')
    const out = findLine((l) => l.url?.path === '/test' && l.http?.response)

    expect(out).toMatchObject({
      http: { response: { status_code: 200 } },
      url: { path: '/test' }
    })
    expect(out).not.toHaveProperty('req')
    expect(out).not.toHaveProperty('res')
  })

  it('should map a logged err to ECS error.* when cdpEnvironment is non-prod', async () => {
    config.set('cdpEnvironment', 'dev')
    const { server, findLine } = await createLogCaptureServer()
    server.route({
      method: 'GET',
      path: '/test',
      handler: (request) => {
        request.logger.error({ message: 'boom path', err: new Error('boom') })
        return 'ok'
      }
    })

    await server.inject('/test')
    const out = findLine((l) => l.message === 'boom path')

    expect(out?.error).toStrictEqual(
      expect.objectContaining({
        type: 'Error',
        message: 'boom',
        stack_trace: expect.stringContaining('Error: boom')
      })
    )
  })

  it('should strip error.stack_trace when cdpEnvironment is prod', async () => {
    config.set('cdpEnvironment', 'prod')
    const { server, findLine } = await createLogCaptureServer()
    server.route({
      method: 'GET',
      path: '/test',
      handler: (request) => {
        request.logger.error({ message: 'boom path', err: new Error('boom') })
        return 'ok'
      }
    })

    await server.inject('/test')
    const out = findLine((l) => l.message === 'boom path')

    expect(out?.error).toBeDefined()
    expect(out?.error).not.toHaveProperty('stack_trace')
  })

  it('should land trace.id on the wire when bound via logger.child (queue-consumer pattern)', () => {
    // Documents the wire shape produced by the trace.id binding used in
    // src/server/queue-consumer/consumer.js. CDP's indexed-fields allowlist
    // does not include a top-level `trace.id` (only `amazon/trace.id` which is
    // CDP-reserved), so the trace context emitted here is dropped at ingest.
    // This test pins the current wire shape so any future change is visible.
    const lines = []
    const stream = { write: (s) => lines.push(s) }
    const { transport: _transport, ...rest } = loggerOptions
    const captureLogger = pino(
      { ...rest, enabled: true, level: 'trace' },
      stream
    )

    const child = captureLogger.child({ trace: { id: 'trace-abc' } })
    child.info({ message: 'queued' })

    const out = JSON.parse(lines[0])
    expect(out).toMatchObject({
      message: 'queued',
      trace: { id: 'trace-abc' }
    })
  })

  it.each(['info', 'error', 'warn', 'debug', 'trace', 'fatal', 'child'])(
    'exposes %s on the singleton logger import',
    (method) => {
      expect(logger[method]).toBeTypeOf('function')
    }
  )

  it('should redact authorization, cookie, and response headers when NODE_ENV is production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()

    const { createLogCaptureServer: createServer } =
      await import('#test/log-capture-server.js')
    const { server, lines } = await createServer()
    server.route({
      method: 'GET',
      path: '/test',
      handler: (_, h) =>
        h.response('ok').header('x-redact-test', 'LEAKED_RESPONSE_HEADER')
    })

    await server.inject({
      url: '/test',
      headers: {
        authorization: 'Bearer LEAKED_JWT_TOKEN',
        cookie: 'session=LEAKED_SESSION_VALUE'
      }
    })

    const emitted = lines.join('\n')

    expect(emitted).not.toContain('LEAKED_JWT_TOKEN')
    expect(emitted).not.toContain('LEAKED_SESSION_VALUE')
    expect(emitted).not.toContain('LEAKED_RESPONSE_HEADER')

    vi.unstubAllEnvs()
  })
})
